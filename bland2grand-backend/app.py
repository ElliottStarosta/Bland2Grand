"""
Bland2Grand Flask Backend

REST API + SSE backend for dispensing system.

Main responsibilities:
- Recipe search and storage
- Dispense session orchestration
- Real-time event streaming via SSE
- Arduino event ingestion (HTTP push)
- Calibration management
"""

import json
from flask import Flask, Response, jsonify, request, stream_with_context
from flask_cors import CORS
import requests

from config import ARDUINO_URL, FLASK_PORT, MOCK_ARDUINO
from database import init_db, get_recipe_by_id, save_recipe, update_calibration
from dispense import (
    register_sse_client,
    unregister_sse_client,
    start_dispense,
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
    start_udp_listener,
)

from search import find_recipes

app = Flask(__name__)

# Allow frontend (React/Vite) to call backend APIs
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Initialize database tables on startup
init_db()



# Health check endpoint

@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "mock_arduino": MOCK_ARDUINO})



# Emergency stop endpoint

import socket


@app.route("/api/stop", methods=["POST"])
def stop_dispense():
    # Access internal dispense state (caution: tight coupling)
    from dispense import _spice_signal, _session

    # Send UDP STOP command to Arduino (best-effort)
    try:
        arduino_host = ARDUINO_URL.replace("http://", "").replace("https://", "")
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.sendto(b"STOP", (arduino_host, 8889))
        sock.close()
        print("[Stop] UDP STOP sent")
    except Exception as e:
        print(f"[Stop] UDP failed: {e}")

    # Force session into stopped state
    _session.active = False
    _spice_signal.signal({"status": "fault"})

    # Broadcast error to all SSE clients
    broadcast(
        {"type": "session_error", "message": "Cancelled by user", "completed": []}
    )

    return jsonify({"status": "stopped"})



# Recipe search endpoint

@app.get("/api/search")
def search():
    query = request.args.get("q", "").strip()

    if not query:
        return jsonify({"results": []})

    results = find_recipes(query)
    return jsonify({"results": results, "count": len(results)})



# Fetch single recipe

@app.get("/api/recipes/<int:recipe_id>")
def get_recipe(recipe_id: int):
    recipe = get_recipe_by_id(recipe_id)

    if not recipe:
        return jsonify({"error": "Recipe not found"}), 404

    return jsonify(recipe)



# Arduino event hooks (bowl detection)

@app.post("/api/arduino/no-bowl")
def arduino_no_bowl():
    data = request.get_json(silent=True) or {}
    handle_arduino_no_bowl(data)
    return jsonify({"ok": True})


@app.post("/api/arduino/bowl-detected")
def arduino_bowl_detected():
    data = request.get_json(silent=True) or {}
    handle_arduino_bowl_detected(data)
    return jsonify({"ok": True})



# Start dispense session

@app.post("/api/dispense")
def dispense():
    if is_busy():
        return jsonify({"error": "A dispense session is already in progress."}), 409

    body = request.get_json(silent=True) or {}

    recipe_id: int | None = body.get("recipe_id")
    serving_count: int = int(body.get("serving_count", 1))

    # Validate input
    if not recipe_id:
        return jsonify({"error": "recipe_id is required."}), 400

    if serving_count < 1 or serving_count > 20:
        return jsonify({"error": "serving_count must be 1–20."}), 400

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
            # Initial handshake event
            yield f"data: {json.dumps({'type': 'connected'})}\n\n"

            while True:
                try:
                    # Wait for backend events
                    event = q.get(timeout=5)

                    payload = f"data: {json.dumps(event)}\n\n"
                    yield payload

                    # Close stream when session ends
                    if event.get("type") in ("session_complete", "session_error"):
                        break

                except Exception:
                    # Keep-alive heartbeat if idle
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"

        except GeneratorExit:
            # Client disconnected
            pass
        finally:
            unregister_sse_client(q)

    response = Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
    )

    # SSE tuning headers for low-latency streaming
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

    # Normalize spice slot keys to 1–8
    normalized = {str(i): float(spices.get(str(i), 0)) for i in range(1, 9)}

    recipe_id = save_recipe(
        name, normalized, category="Custom", description=description
    )

    recipe = get_recipe_by_id(recipe_id)

    return jsonify({"status": "created", "recipe": recipe}), 201



# Arduino push events (SSE bridge)

@app.post("/api/arduino/nearly-there")
def arduino_nearly_there():
    data = request.get_json(silent=True) or {}
    handle_arduino_nearly_there(data)
    return jsonify({"ok": True})


@app.post("/api/arduino/indexing")
def arduino_indexing():
    data = request.get_json(silent=True) or {}
    handle_arduino_indexing(data)
    return jsonify({"ok": True})


@app.post("/api/arduino/dispense-start")
def arduino_dispense_start():
    data = request.get_json(silent=True) or {}
    handle_arduino_dispense_start(data)
    return jsonify({"ok": True})


@app.post("/api/arduino/weight-push")
def arduino_weight_push():
    data = request.get_json(silent=True) or {}
    handle_arduino_weight_push(data)
    return jsonify({"ok": True})


@app.post("/api/arduino/spice-complete")
def arduino_spice_complete():
    data = request.get_json(silent=True) or {}
    handle_arduino_spice_complete(data)
    return jsonify({"ok": True})


@app.post("/api/arduino/session-complete")
def arduino_session_complete():
    data = request.get_json(silent=True) or {}
    handle_arduino_session_complete(data)
    return jsonify({"ok": True})


@app.post("/api/arduino/fault")
def arduino_fault():
    data = request.get_json(silent=True) or {}
    handle_arduino_fault(data)
    return jsonify({"ok": True})



# Entry point

if __name__ == "__main__":
    print(f"[Bland2Grand] Starting Flask on port {FLASK_PORT}")
    print(f"[Bland2Grand] Arduino mode: {'MOCK' if MOCK_ARDUINO else 'REAL'}")

    app.run(host="0.0.0.0", port=FLASK_PORT, threaded=True, debug=False)