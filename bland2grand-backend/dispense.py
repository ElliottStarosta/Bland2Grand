import queue
import random
import threading
import time
from typing import Optional

import requests
from config import ARDUINO_URL, MOCK_ARDUINO, SPICE_SLOTS

# SSE client registry

_sse_clients: list[queue.Queue] = []
_clients_lock = threading.Lock()


def register_sse_client() -> queue.Queue:
    q: queue.Queue = queue.Queue(maxsize=50)
    with _clients_lock:
        _sse_clients.append(q)
    return q


def unregister_sse_client(q: queue.Queue) -> None:
    with _clients_lock:
        try:
            _sse_clients.remove(q)
        except ValueError:
            pass


def _broadcast(event: dict) -> None:
    print(f"[Broadcast] {event['type']} → {len(_sse_clients)} clients")
    with _clients_lock:
        for q in _sse_clients:
            try:
                q.put_nowait(event)
            except queue.Full:
                pass


# Completion signal from Arduino
# When Arduino pushes /api/arduino/spice-complete, Flask sets this
# event so the dispense loop knows to move to the next spice.


class _SpiceCompleteSignal:
    def __init__(self):
        self._event = threading.Event()
        self._result: dict = {}

    def wait(self, timeout_s: float) -> bool:
        """Block until Arduino signals done, or timeout. Returns True if done."""
        return self._event.wait(timeout=timeout_s)

    def signal(self, result: dict) -> None:
        """Called by the Arduino push handler to unblock the dispense loop."""
        self._result = result
        self._event.set()

    def reset(self) -> None:
        self._event.clear()
        self._result = {}

    @property
    def result(self) -> dict:
        return self._result


_spice_signal = _SpiceCompleteSignal()


# Session state


class DispenseSession:
    def __init__(self) -> None:
        self.active = False
        self.thread: Optional[threading.Thread] = None

    @property
    def busy(self) -> bool:
        return self.active and self.thread is not None and self.thread.is_alive()


_session = DispenseSession()


# Arduino push receivers
# Called directly by Flask route handlers in app.py.


def handle_arduino_indexing(data: dict) -> None:
    _broadcast(
        {
            "type": "indexing",
            "slot": data.get("slot"),
            "spice_name": data.get("spice_name", ""),
            "slot_index": data.get("slot_index", 0),
            "total_slots": data.get("total_slots", 1),
        }
    )


def handle_arduino_dispense_start(data: dict) -> None:
    _broadcast(
        {
            "type": "dispensing_start",
            "slot": data.get("slot"),
            "spice_name": data.get("spice_name", ""),
            "target_weight": data.get("target_weight", 0.0),
            "slot_index": data.get("slot_index", 0),
            "total_slots": data.get("total_slots", 1),
        }
    )


def handle_arduino_weight_push(data: dict) -> None:
    _broadcast(
        {
            "type": "weight_update",
            "slot": data.get("slot"),
            "current_weight": data.get("current_weight", 0.0),
            "target_weight": data.get("target_weight", 0.0),
        }
    )


def handle_arduino_spice_complete(data: dict) -> None:
    """
    Arduino finished one spice. Broadcast to frontend AND
    unblock the dispense loop so it can send the next spice command.
    """
    _broadcast(
        {
            "type": "spice_complete",
            "slot": data.get("slot"),
            "spice_name": data.get("spice_name", ""),
            "actual": data.get("actual", 0.0),
            "target": data.get("target", 0.0),
            "status": data.get("status", "done"),
            "slot_index": data.get("slot_index", 0),
        }
    )
    # Unblock the waiting dispense loop
    _spice_signal.signal(data)


def handle_arduino_session_complete(data: dict) -> None:
    _session.active = False
    _broadcast(
        {
            "type": "session_complete",
            "recipe_name": data.get("recipe_name", ""),
            "completed": [],
        }
    )


def handle_arduino_fault(data: dict) -> None:
    _session.active = False
    _spice_signal.signal({"status": "fault"})  # unblock loop on fault too
    _broadcast(
        {
            "type": "session_error",
            "message": data.get("message", "Arduino fault"),
            "completed": [],
        }
    )


# Mock helpers


def _mock_dispense_spice(slot: int, target_grams: float) -> dict:
    current = 0.0
    timeout_at = time.time() + 60

    while current < target_grams:
        if time.time() > timeout_at:
            return {"status": "timeout", "actual": round(current, 2)}

        ratio = current / target_grams if target_grams > 0 else 1.0
        if ratio < 0.80:
            speed, sleep_t = 1.0, 0.15
        elif ratio < 0.95:
            speed, sleep_t = 0.4, 0.20
        else:
            speed, sleep_t = 0.10, 0.25

        noise = random.uniform(-0.03, 0.05)
        step = target_grams * 0.04 * speed
        current = min(current + max(0.0, step + noise), target_grams)

        _broadcast(
            {
                "type": "weight_update",
                "slot": slot,
                "current_weight": round(current, 2),
                "target_weight": round(target_grams, 2),
            }
        )
        time.sleep(sleep_t)

    return {"status": "done", "actual": round(current, 2)}


# Main dispense orchestration


def start_dispense(recipe: dict, serving_count: int) -> tuple[bool, str]:
    if _session.busy:
        return False, "A dispense is already in progress."

    spices = recipe.get("spices", [])
    if not spices:
        return False, "Recipe has no spices."

    targets: list[tuple[int, str, float]] = []
    for sp in sorted(spices, key=lambda s: s["slot"]):
        g = round(sp["grams_per_serving"] * serving_count, 1)
        if g > 0:
            targets.append((sp["slot"], sp["name"], g))

    if not targets:
        return False, "No spice amounts to dispense."

    def _run() -> None:
        _session.active = True
        time.sleep(0.3)

        try:
            # Tell frontend the session is starting
            _broadcast(
                {
                    "type": "session_start",
                    "recipe_name": recipe["name"],
                    "total_slots": len(targets),
                    "slots": [
                        {"slot": s, "name": n, "target": g} for s, n, g in targets
                    ],
                }
            )

            completed: list[dict] = []

            # Loop through each spice ONE AT A TIME
            for idx, (slot, name, target_grams) in enumerate(targets):

                if MOCK_ARDUINO:
                    # MOCK MODE
                    _broadcast(
                        {
                            "type": "indexing",
                            "slot": slot,
                            "spice_name": name,
                            "slot_index": idx,
                            "total_slots": len(targets),
                        }
                    )
                    time.sleep(random.uniform(0.8, 1.2))

                    _broadcast(
                        {
                            "type": "dispensing_start",
                            "slot": slot,
                            "spice_name": name,
                            "target_weight": target_grams,
                            "slot_index": idx,
                            "total_slots": len(targets),
                        }
                    )

                    result = _mock_dispense_spice(slot, target_grams)

                    _broadcast(
                        {
                            "type": "spice_complete",
                            "slot": slot,
                            "spice_name": name,
                            "actual": result["actual"],
                            "target": target_grams,
                            "status": result["status"],
                            "slot_index": idx,
                        }
                    )

                else:
                    # REAL ARDUINO MODE

                    # Reset the signal BEFORE sending the command,
                    # so we don't miss a very fast response
                    _spice_signal.reset()

                    # Send this single spice command to the Arduino.
                    # Arduino responds "accepted" immediately (within ~5ms),
                    # then goes off and does the physical work.
                    try:
                        resp = requests.post(
                            f"{ARDUINO_URL}/",
                            json={
                                "carousel": slot,
                                "grams": target_grams,
                                "recipe_name": recipe["name"],
                                "spice_name": name,
                                "slot_index": idx,
                                "total_slots": len(targets),
                            },
                            timeout=10,  # just waiting for "accepted" ACK
                        )
                        if resp.status_code != 200:
                            raise Exception(f"Arduino rejected command: {resp.text}")

                    except Exception as exc:
                        print(f"[Dispense] Failed to send command to Arduino: {exc}")
                        _broadcast(
                            {
                                "type": "session_error",
                                "message": f"Could not reach Arduino: {exc}",
                                "completed": completed,
                            }
                        )
                        return

                    # NOW BLOCK HERE, waiting for Arduino to push back
                    # /api/arduino/spice-complete (which calls _spice_signal.signal())
                    # Timeout = dispense timeout + carousel time + buffer
                    SPICE_TIMEOUT_S = 120
                    finished = _spice_signal.wait(timeout_s=SPICE_TIMEOUT_S)

                    if not finished:
                        print(
                            f"[Dispense] Timeout waiting for spice {name} (slot {slot})"
                        )
                        _broadcast(
                            {
                                "type": "session_error",
                                "message": f"Timeout waiting for {name}",
                                "completed": completed,
                            }
                        )
                        return

                    result = _spice_signal.result

                # Accumulate result
                completed.append(
                    {
                        "slot": slot,
                        "name": name,
                        "target": target_grams,
                        "actual": result.get("actual", 0.0),
                        "status": result.get("status", "done"),
                    }
                )

                # Abort on fault
                if result.get("status") in ("timeout", "overload", "fault"):
                    _broadcast(
                        {
                            "type": "session_error",
                            "message": f"{name} failed: {result.get('status')}",
                            "completed": completed,
                        }
                    )
                    return

            # All spices done
            _broadcast(
                {
                    "type": "session_complete",
                    "recipe_name": recipe["name"],
                    "completed": completed,
                }
            )

        except Exception as exc:
            print(f"[Dispense] Unhandled error: {exc}")
            _broadcast({"type": "session_error", "message": str(exc), "completed": []})
        finally:
            _session.active = False

    _session.thread = threading.Thread(target=_run, daemon=True)
    _session.thread.start()
    return True, "Dispense started."


def is_busy() -> bool:
    return _session.busy
