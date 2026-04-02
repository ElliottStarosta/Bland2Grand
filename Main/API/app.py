"""
Main Flask application for Bland2Grand.

Endpoints
---------
GET  /api/search?q=<dish>              Search recipes, AI fallback if no match
GET  /api/recipe/<id>                  Get a single recipe by ID
POST /api/dispense                     Start a dispense sequence
GET  /api/dispense/stream              SSE stream for live dispense progress
GET  /api/dispense/status              Polling fallback for SSE
POST /api/recipe/custom                Save a custom user recipe
POST /api/calibrate                    Update per-spice calibration values
GET  /api/spices                       List the 8 spices and their motor slots
GET  /api/stats                        Usage statistics
"""

import os
import json
import threading
from flask import Flask, request, jsonify, Response, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

from database import (
    init_db, get_connection, insert_ai_recipe,
    increment_use_count, SPICES,
)
from search import search_recipes, get_recipe_by_id, recipe_to_dispense_plan
from ai_client import get_ai_recipe, AiError
from dispenser import run_dispense, get_sse_stream, get_session_status, MOTOR_MAP

load_dotenv()

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)  # allow React dev server on :3000 during development

FLASK_PORT  = int(os.getenv("FLASK_PORT", 5000))
FLASK_DEBUG = os.getenv("FLASK_DEBUG", "false").lower() == "true"

# Calibration store: spice -> grams_per_revolution
# Persisted in a JSON sidecar file so it survives restarts.
CALIBRATION_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "calibration.json"
)

_calibration_lock = threading.Lock()


def _load_calibration() -> dict:
    if os.path.exists(CALIBRATION_PATH):
        with open(CALIBRATION_PATH) as f:
            return json.load(f)
    # Defaults based on average bulk densities and auger geometry estimates
    return {
        "cumin":         0.18,
        "paprika":       0.19,
        "garlic_powder": 0.17,
        "chili_powder":  0.18,
        "oregano":       0.07,   # much lower density
        "onion_powder":  0.18,
        "black_pepper":  0.15,
        "cayenne":       0.16,
    }


def _save_calibration(data: dict):
    with open(CALIBRATION_PATH, "w") as f:
        json.dump(data, f, indent=2)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _recipe_to_response(recipe: dict) -> dict:
    """Convert a raw recipe row dict to the API response shape."""
    return {
        "id":           recipe["id"],
        "name":         recipe["name"],
        "description":  recipe["description"],
        "cuisine_tag":  recipe["cuisine_tag"],
        "ai_generated": bool(recipe.get("ai_generated")),
        "use_count":    recipe.get("use_count", 0),
        "spices": {
            spice: recipe.get(spice, 0) or 0
            for spice in SPICES
        },
    }


def _error(message: str, code: int = 400) -> tuple:
    return jsonify({"error": message}), code


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/api/search")
def search():
    """
    Search recipes by dish name.
    Falls back to AI if no local results found.
    Query params:
      q      -- dish name to search (required)
      limit  -- max results (default 3)
    """
    q     = request.args.get("q", "").strip()
    limit = min(int(request.args.get("limit", 3)), 10)

    if not q:
        return _error("Query parameter 'q' is required")

    results = search_recipes(q, limit=limit)

    # AI fallback if nothing found locally
    if not results:
        try:
            ai_result = get_ai_recipe(q)
            recipe_id = insert_ai_recipe(
                name        = ai_result["name"],
                cuisine_tag = ai_result["cuisine_tag"],
                description = ai_result["description"],
                spice_grams = ai_result["spice_grams"],
            )
            recipe = get_recipe_by_id(recipe_id)
            if recipe:
                results = [recipe]
        except AiError as e:
            # Graceful degradation: no results, no crash
            return jsonify({
                "results":  [],
                "ai_used":  True,
                "ai_error": str(e),
                "query":    q,
            })

    for r in results:
        increment_use_count(r["id"])

    return jsonify({
        "results": [_recipe_to_response(r) for r in results],
        "query":   q,
        "count":   len(results),
    })


@app.route("/api/recipe/<int:recipe_id>")
def get_recipe(recipe_id: int):
    recipe = get_recipe_by_id(recipe_id)
    if not recipe:
        return _error("Recipe not found", 404)
    return jsonify(_recipe_to_response(recipe))


@app.route("/api/dispense", methods=["POST"])
def dispense():
    """
    Start a dispense sequence.
    Body JSON:
      recipe_id  -- int
      servings   -- float (1 to 20)
    """
    body = request.get_json(silent=True) or {}
    recipe_id = body.get("recipe_id")
    servings  = float(body.get("servings", 1))

    if not recipe_id:
        return _error("recipe_id is required")
    if not (0.5 <= servings <= 20):
        return _error("servings must be between 0.5 and 20")

    recipe = get_recipe_by_id(recipe_id)
    if not recipe:
        return _error("Recipe not found", 404)

    plan = recipe_to_dispense_plan(recipe, servings)
    if not plan:
        return _error("Recipe has no non-zero spice amounts")

    # Start the dispense in a background thread;
    # client should open /api/dispense/stream for live updates
    run_dispense(recipe_id, plan, servings)

    return jsonify({
        "status":   "started",
        "recipe":   recipe["name"],
        "servings": servings,
        "plan":     plan,
    })


@app.route("/api/dispense/stream")
def dispense_stream():
    """
    Server-Sent Events endpoint.
    Client should open this immediately after POST /api/dispense.
    """
    return Response(
        get_sse_stream(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control":               "no-cache",
            "X-Accel-Buffering":           "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


@app.route("/api/dispense/status")
def dispense_status():
    """Polling fallback for environments where SSE is not supported."""
    return jsonify(get_session_status())


@app.route("/api/recipe/custom", methods=["POST"])
def save_custom_recipe():
    """
    Save a user-defined custom recipe.
    Body JSON:
      name        -- str
      description -- str (optional)
      cuisine_tag -- str (optional)
      spices      -- { spice_key: grams_per_serving }
    """
    body = request.get_json(silent=True) or {}
    name        = str(body.get("name", "")).strip()
    description = str(body.get("description", "Custom recipe")).strip()
    cuisine_tag = str(body.get("cuisine_tag", "general")).strip()
    spices_in   = body.get("spices", {})

    if not name:
        return _error("name is required")

    spice_grams = {}
    for spice in SPICES:
        val = spices_in.get(spice, 0)
        try:
            spice_grams[spice] = max(0.0, min(float(val), 10.0))
        except (TypeError, ValueError):
            spice_grams[spice] = 0.0

    if sum(spice_grams.values()) < 0.5:
        return _error("Recipe must have at least one non-zero spice amount")

    recipe_id = insert_ai_recipe(name, cuisine_tag, description, spice_grams)
    recipe = get_recipe_by_id(recipe_id)

    return jsonify({
        "status": "saved",
        "recipe": _recipe_to_response(recipe) if recipe else {"id": recipe_id},
    }), 201


@app.route("/api/calibrate", methods=["POST"])
def calibrate():
    """
    Update the grams-per-revolution calibration for a spice slot.
    Body JSON:
      spice              -- str (spice key)
      grams_per_revolution -- float
    """
    body = request.get_json(silent=True) or {}
    spice = body.get("spice", "").strip()
    gpr   = body.get("grams_per_revolution")

    if spice not in SPICES:
        return _error(f"Unknown spice. Must be one of: {', '.join(SPICES)}")
    if gpr is None:
        return _error("grams_per_revolution is required")

    try:
        gpr = float(gpr)
        if not (0.01 <= gpr <= 2.0):
            return _error("grams_per_revolution must be between 0.01 and 2.0")
    except (TypeError, ValueError):
        return _error("grams_per_revolution must be a number")

    with _calibration_lock:
        cal = _load_calibration()
        cal[spice] = gpr
        _save_calibration(cal)

    return jsonify({"status": "updated", "spice": spice, "grams_per_revolution": gpr})


@app.route("/api/calibrate", methods=["GET"])
def get_calibration():
    return jsonify(_load_calibration())


@app.route("/api/spices")
def list_spices():
    """Return the 8 spice slots with their motor assignments."""
    cal = _load_calibration()
    spice_info = [
        {
            "key":               spice,
            "motor":             MOTOR_MAP[spice],
            "grams_per_revolution": cal.get(spice, 0.18),
        }
        for spice in SPICES
    ]
    return jsonify({"spices": spice_info})


@app.route("/api/stats")
def stats():
    """Return usage statistics."""
    conn = get_connection()
    total_recipes   = conn.execute("SELECT COUNT(*) FROM recipes").fetchone()[0]
    ai_recipes      = conn.execute(
        "SELECT COUNT(*) FROM recipes WHERE ai_generated=1"
    ).fetchone()[0]
    total_dispenses = conn.execute("SELECT COUNT(*) FROM dispense_log").fetchone()[0]
    top_recipes     = conn.execute("""
        SELECT name, use_count FROM recipes
        ORDER BY use_count DESC LIMIT 5
    """).fetchall()
    conn.close()

    return jsonify({
        "total_recipes":   total_recipes,
        "ai_recipes":      ai_recipes,
        "total_dispenses": total_dispenses,
        "top_recipes":     [dict(r) for r in top_recipes],
    })


# ---------------------------------------------------------------------------
# Serve React build (production)
# ---------------------------------------------------------------------------

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path: str):
    static_folder = app.static_folder
    if static_folder and os.path.exists(os.path.join(static_folder, path)):
        return send_from_directory(static_folder, path)
    if static_folder and os.path.exists(os.path.join(static_folder, "index.html")):
        return send_from_directory(static_folder, "index.html")
    return jsonify({"message": "Bland2Grand API", "version": "1.0"}), 200


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    init_db()
    print(f"[APP] Starting Bland2Grand on http://0.0.0.0:{FLASK_PORT}")
    app.run(host="0.0.0.0", port=FLASK_PORT, debug=FLASK_DEBUG)
