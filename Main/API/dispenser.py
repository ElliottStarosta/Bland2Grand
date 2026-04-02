"""
dispenser.py
------------
Manages communication with the Arduino Mega2560 over WiFi (TCP socket)
and orchestrates the dispense sequence.

The Arduino firmware listens on TCP port 8080 for JSON commands:
  { "motor": <1-8>, "grams": <float> }

And responds with:
  { "status": "done", "actual": <float> }
  { "status": "error", "message": <str> }

The dispenser module:
  1. Resolves which motor index corresponds to each spice slot.
  2. Sends dispense commands one spice at a time (sequential).
  3. Streams progress events to the SSE queue so the frontend
     gets live gram updates.
  4. Collects actual dispensed weights and returns a summary.

In SIMULATION mode (ARDUINO_HOST=simulate) the module fakes the
Arduino responses. Useful for development without hardware.
"""

import os
import json
import socket
import time
import queue
import threading
from typing import Dict, Generator
from dotenv import load_dotenv
from database import SPICES, log_dispense

load_dotenv()

ARDUINO_HOST = os.getenv("ARDUINO_HOST", "simulate")
ARDUINO_PORT = int(os.getenv("ARDUINO_PORT", "8080"))
SOCKET_TIMEOUT = 30  # seconds

# Motor slot assignments: spice name -> motor index (1-based, matches Arduino)
MOTOR_MAP: Dict[str, int] = {
    "cumin": 1,
    "paprika": 2,
    "garlic_powder": 3,
    "chili_powder": 4,
    "oregano": 5,
    "onion_powder": 6,
    "black_pepper": 7,
    "cayenne": 8,
}

# One global SSE queue per dispense session (replaced on each new dispense)
_sse_queue: queue.Queue = queue.Queue()
_current_session: dict = {}


# ---------------------------------------------------------------------------
# SSE event helpers
# ---------------------------------------------------------------------------


def _emit(event_type: str, data: dict):
    """Push an event into the SSE queue."""
    _sse_queue.put({"event": event_type, "data": data})


def get_sse_stream() -> Generator[str, None, None]:
    """
    Generator consumed by Flask SSE endpoint.
    Yields server-sent event strings until the 'complete' event is received.
    """
    while True:
        try:
            item = _sse_queue.get(timeout=60)
        except queue.Empty:
            yield "event: heartbeat\ndata: {}\n\n"
            continue

        payload = json.dumps(item["data"])
        yield f"event: {item['event']}\ndata: {payload}\n\n"

        if item["event"] in ("complete", "error"):
            break


# ---------------------------------------------------------------------------
# Arduino communication
# ---------------------------------------------------------------------------


def _send_command(motor: int, grams: float) -> dict:
    """
    Send one dispense command to the Arduino and wait for confirmation.
    Returns { "status": "done"|"error", "actual": float }
    """
    if ARDUINO_HOST == "simulate":
        return _simulate_dispense(motor, grams)

    cmd = json.dumps({"carousel": motor, "grams": grams}) + "\n"
    try:
        with socket.create_connection(
            (ARDUINO_HOST, ARDUINO_PORT), timeout=SOCKET_TIMEOUT
        ) as sock:
            sock.sendall(cmd.encode())
            response = b""
            while True:
                chunk = sock.recv(256)
                if not chunk:
                    break
                response += chunk
                if b"\n" in response:
                    break
        return json.loads(response.decode().strip())
    except socket.timeout:
        return {"status": "error", "message": "Arduino timeout"}
    except ConnectionRefusedError:
        return {"status": "error", "message": "Arduino not reachable"}
    except json.JSONDecodeError:
        return {"status": "error", "message": "Malformed Arduino response"}


def _simulate_dispense(motor: int, grams: float) -> dict:
    """
    Simulate a dispense for development without hardware.
    Emits intermediate progress events to match real hardware behaviour.
    """
    steps = 10
    for i in range(1, steps + 1):
        partial = round(grams * i / steps, 2)
        _emit(
            "progress",
            {
                "motor": motor,
                "current": partial,
                "target": grams,
            },
        )
        time.sleep(0.15)

    # Simulate tiny real-world error (within hardware spec)
    import random

    actual = round(grams + random.uniform(-0.15, 0.15), 2)
    return {"status": "done", "actual": actual}


# ---------------------------------------------------------------------------
# Main dispense orchestrator
# ---------------------------------------------------------------------------


def run_dispense(recipe_id: int, dispense_plan: Dict[str, float], servings: float):
    """
    Execute a full dispense sequence in a background thread.

    dispense_plan: { spice_key: grams } for each spice to dispense.
    Emits SSE events throughout. Logs the result to the database.
    """
    global _sse_queue, _current_session
    _sse_queue = queue.Queue()

    spices_ordered = [
        (spice, grams) for spice, grams in dispense_plan.items() if grams > 0
    ]
    total_spices = len(spices_ordered)

    _current_session = {
        "recipe_id": recipe_id,
        "total_spices": total_spices,
        "completed": 0,
        "running": True,
        "actual_weights": {},
    }

    def _worker():
        _emit(
            "start",
            {
                "recipe_id": recipe_id,
                "total_spices": total_spices,
                "plan": dispense_plan,
            },
        )

        for idx, (spice, grams) in enumerate(spices_ordered, start=1):
            motor = MOTOR_MAP.get(spice)
            if motor is None:
                _emit("error", {"message": f"No motor mapped for spice: {spice}"})
                _current_session["running"] = False
                return

            _emit(
                "spice_start",
                {
                    "spice": spice,
                    "motor": motor,
                    "target": grams,
                    "index": idx,
                    "total": total_spices,
                },
            )

            result = _send_command(motor, grams)

            if result.get("status") == "error":
                _emit(
                    "error",
                    {
                        "spice": spice,
                        "message": result.get("message", "Unknown error"),
                    },
                )
                _current_session["running"] = False
                return

            actual = float(result.get("actual", grams))
            _current_session["actual_weights"][spice] = actual
            _current_session["completed"] += 1

            _emit(
                "spice_done",
                {
                    "spice": spice,
                    "motor": motor,
                    "target": grams,
                    "actual": actual,
                    "accuracy": round(abs(actual - grams), 2),
                    "index": idx,
                    "total": total_spices,
                },
            )

        # All spices done
        _current_session["running"] = False
        log_dispense(recipe_id, servings, _current_session["actual_weights"])

        _emit(
            "complete",
            {
                "recipe_id": recipe_id,
                "servings": servings,
                "actual_weights": _current_session["actual_weights"],
                "plan": dispense_plan,
            },
        )

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()


def get_session_status() -> dict:
    """Return the current session state for polling fallback."""
    return dict(_current_session)
