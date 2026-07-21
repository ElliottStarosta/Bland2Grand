"""
Bland2Grand Flask Backend (App Lab / UNO Q version)

Runs entirely on the UNO Q's Linux (MPU) side: REST API + SSE backend +
the built React frontend, all served by this one Flask app. Talks to the
MCU sketch over the RouterBridge instead of WiFi/HTTP.

Main responsibilities:
- Serve the built frontend (static files)
- Recipe search and storage
- Dispense session orchestration
- Real-time event streaming via SSE
- MCU event ingestion (via Bridge.provide, not HTTP push)
- Calibration management
"""

import json
import os
from flask import Flask, Response, jsonify, request, send_from_directory, stream_with_context

from config import FLASK_PORT, FRONTEND_DIST, MOCK_BRIDGE
from database import init_db, get_recipe_by_id, save_recipe, update_calibration
from dispense import (
    register_sse_client,
    unregister_sse_client,
    start_dispense,
    stop_dispense,
    is_busy,
    broadcast,
    handle_arduino_indexing,
    handle_arduino_dispense_start,
    handle_arduino_weight_push,
    handle_arduino_spice_complete,
    handle_arduino_session_complete,
    handle_arduino_fault,
    handle_arduino_nearly_there,
    handle_arduino_no_bowl,
    handle_arduino_bowl_detected,
)

from search import find_recipes

app = Flask(__name__, static_folder=FRONTEND_DIST, static_url_path="")

# Initialize database tables on startup
init_db()

# Bridge wiring
if not MOCK_BRIDGE:
    from arduino.app_utils import Bridge, App

    Bridge.provide("push_indexing", handle_arduino_indexing)
    Bridge.provide("push_nearly_there", handle_arduino_nearly_there)
    Bridge.provide("push_dispense_start", handle_arduino_dispense_start)
    Bridge.provide("push_weight_update", handle_arduino_weight_push)
    Bridge.provide("push_spice_complete", handle_arduino_spice_complete)
    Bridge.provide("push_session_complete", handle_arduino_session_complete)
    Bridge.provide("push_fault", handle_arduino_fault)
    Bridge.provide("push_no_bowl", handle_arduino_no_bowl)
    Bridge.provide("push_bowl_detected", handle_arduino_bowl_detected)


# Health check endpoint
@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "mock_bridge": MOCK_BRIDGE})


# Emergency stop endpoint
@app.route("/api/stop", methods=["POST"])
def stop_dispense_route():
    stop_dispense()  # sends Bridge.call("stop_dispense") + resets session state
    return jsonify({"status": "stopped"})


# Recipe search endpoint
@app.get("/api/search")
def search():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"results": []})
    results = find_recipes(query)
    return jsonify({"results": results, "count": len(results)})


# Fetch single recipe by ID
@app.get("/api/recipes/<int:recipe_id>")
def get_recipe(recipe_id: int):
    recipe = get_recipe_by_id(recipe_id)
    if not recipe:
        return jsonify({"error": "Recipe not found"}), 404
    return jsonify(recipe)


# Start dispense session
@app.post("/api/dispense")
def dispense():
    if is_busy():
        return jsonify({"error": "A dispense session is already in progress."}), 409

    body = request.get_json(silent=True) or {}

    recipe_id: int | None = body.get("recipe_id")
    serving_count: int = int(body.get("serving_count", 1))

    if not recipe_id:
        return jsonify({"error": "recipe_id is required."}), 400

    if serving_count < 1 or serving_count > 20:
        return jsonify({"error": "serving_count must be 1-20."}), 400

    recipe = get_recipe_by_id(recipe_id)
    if not recipe:
        return jsonify({"error": "Recipe not found."}), 404

    success, message = start_dispense(recipe, serving_count)
    if not success:
        return jsonify({"error": message}), 400

    return jsonify(
        {"status": "started", "recipe": recipe["name"], "servings": serving_count}
    )


# SSE stream (real-time updates)
@app.get("/api/status/stream")
def status_stream():
    def generate():
        q = register_sse_client()
        try:
            yield f"data: {json.dumps({'type': 'connected'})}\n\n"
            while True:
                try:
                    event = q.get(timeout=5)
                    yield f"data: {json.dumps(event)}\n\n"
                    if event.get("type") in ("session_complete", "session_error"):
                        break
                except Exception:
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        except GeneratorExit:
            pass
        finally:
            unregister_sse_client(q)

    response = Response(stream_with_context(generate()), mimetype="text/event-stream")
    response.headers["Cache-Control"] = "no-cache"
    response.headers["X-Accel-Buffering"] = "no"
    response.headers["Connection"] = "keep-alive"
    response.headers["Transfer-Encoding"] = "chunked"
    return response


# Calibration update
@app.post("/api/calibrate")
def calibrate():
    body = request.get_json(silent=True) or {}
    slot = body.get("slot")
    cal_factor = body.get("cal_factor")
    if slot is None or cal_factor is None:
        return jsonify({"error": "slot and cal_factor are required."}), 400
    update_calibration(int(slot), float(cal_factor))
    return jsonify({"status": "ok", "slot": slot, "cal_factor": cal_factor})


# Create custom recipe
@app.post("/api/recipe")
def create_recipe():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    spices: dict = body.get("spices", {})
    description = (body.get("description") or "").strip()

    if not name:
        return jsonify({"error": "name is required."}), 400

    normalized = {str(i): float(spices.get(str(i), 0)) for i in range(1, 9)}
    recipe_id = save_recipe(name, normalized, category="Custom", description=description)
    recipe = get_recipe_by_id(recipe_id)
    return jsonify({"status": "created", "recipe": recipe}), 201


# Frontend serving 

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


# Entry point
if __name__ == "__main__":
    print(f"[Bland2Grand] Starting Flask on port {FLASK_PORT}")
    print(f"[Bland2Grand] Bridge mode: {'MOCK' if MOCK_BRIDGE else 'REAL'}")
    
    app.run(host="0.0.0.0", port=FLASK_PORT, threaded=True, debug=False)