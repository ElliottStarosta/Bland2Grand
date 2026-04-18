# import json  # not used right now
import queue
import random
import threading
import time
from typing import Optional

import requests
from config import ARDUINO_URL, MOCK_ARDUINO, SPICE_SLOTS


# list of all connected clients (each gets its own queue)
_sse_clients: list[queue.Queue] = []
_clients_lock = threading.Lock()  # prevent race conditions when modifying list


def register_sse_client() -> queue.Queue:
    # create a queue for this client to receive events
    q: queue.Queue = queue.Queue(maxsize=50)

    # add it to the global list safely
    with _clients_lock:
        _sse_clients.append(q)

    return q


def unregister_sse_client(q: queue.Queue) -> None:
    # remove client when they disconnect
    with _clients_lock:
        try:
            _sse_clients.remove(q)
        except ValueError:
            pass  # already removed or never added


def _broadcast(event: dict) -> None:
    # send an event to all connected clients
    # non-blocking so one slow client doesn't freeze everything
    print(f"[Broadcast] {event['type']} → {len(_sse_clients)} clients")
    
    with _clients_lock:
        for q in _sse_clients:
            try:
                q.put_nowait(event)
            except queue.Full:
                pass  # client is too slow, just drop the update


# keeps track of whether a dispense is currently running
class DispenseSession:
    def __init__(self) -> None:
        self.active = False
        self.lock = threading.Lock()
        self.thread: Optional[threading.Thread] = None

    @property
    def busy(self) -> bool:
        # true if a thread is running and marked active
        return self.active and self.thread is not None and self.thread.is_alive()


_session = DispenseSession()


# send request to Arduino and wait for response
def _send_to_arduino(slot: int, grams: float) -> dict:
    url = f"{ARDUINO_URL}/"
    payload = {"carousel": slot, "grams": grams}

    # send command (blocking)
    resp = requests.post(url, json=payload, timeout=90)
    resp.raise_for_status()

    # expected: {"status": "done"|"timeout", "actual": float}
    return resp.json()


# fake Arduino logic so you can test without hardware
def _mock_dispense_spice(slot: int, target_grams: float) -> dict:
    current = 0.0

    # simulate weight increase with some randomness
    def weight_tick(speed_factor: float) -> float:
        noise = random.uniform(-0.03, 0.05)
        step = target_grams * 0.04 * speed_factor
        return max(0.0, step + noise)

    timeout_at = time.time() + 60  # stop after 60s

    while current < target_grams:
        if time.time() > timeout_at:
            return {"status": "timeout", "actual": round(current, 2)}

        ratio = current / target_grams if target_grams > 0 else 1.0

        # slow down as we approach target (like real system)
        if ratio < 0.80:
            speed = 1.0
            sleep = 0.15
        elif ratio < 0.95:
            speed = 0.4
            sleep = 0.20
        else:
            speed = 0.10
            sleep = 0.25

        current = min(current + weight_tick(speed), target_grams)

        # send live weight updates to UI
        _broadcast({
            "type": "weight_update",
            "slot": slot,
            "current_weight": round(current, 2),
            "target_weight": round(target_grams, 2),
        })

        time.sleep(sleep)

    return {"status": "done", "actual": round(current, 2)}


# main entry point for starting a dispense
def start_dispense(recipe: dict, serving_count: int) -> tuple[bool, str]:
    # don't allow multiple runs at once
    if _session.busy:
        return False, "A dispense is already in progress."

    spices = recipe.get("spices", [])
    if not spices:
        return False, "Recipe has no spices."

    # build list of (slot, name, total grams)
    targets: list[tuple[int, str, float]] = []
    for sp in sorted(spices, key=lambda s: s["slot"]):
        g = round(sp["grams_per_serving"] * serving_count, 1)
        if g > 0:
            targets.append((sp["slot"], sp["name"], g))

    if not targets:
        return False, "No spice amounts to dispense."

    # this runs in a background thread
    def _run() -> None:
        _session.active = True
        time.sleep(0.5)
        print(f"[Dispense] _run() started, clients={len(_sse_clients)}")

        try:
            # tell UI we're starting
            _broadcast({
                "type": "session_start",
                "recipe_name": recipe["name"],
                "total_slots": len(targets),
                "slots": [{"slot": s, "name": n, "target": g} for s, n, g in targets],
            })

            completed: list[dict] = []

            for idx, (slot, name, target_grams) in enumerate(targets):

                # tell UI we're moving to this slot
                _broadcast({
                    "type": "indexing",
                    "slot": slot,
                    "spice_name": name,
                    "slot_index": idx,
                    "total_slots": len(targets),
                })

                # simulate carousel movement if no hardware
                if MOCK_ARDUINO:
                    time.sleep(random.uniform(0.8, 1.2))

                # tell UI dispensing is starting
                _broadcast({
                    "type": "dispensing_start",
                    "slot": slot,
                    "spice_name": name,
                    "target_weight": target_grams,
                    "slot_index": idx,
                    "total_slots": len(targets),
                })

                # actually dispense
                if MOCK_ARDUINO:
                    result = _mock_dispense_spice(slot, target_grams)
                else:
                    try:
                        result = _send_to_arduino(slot, target_grams)
                    except Exception as exc:
                        print(f"[Dispense] Arduino error on slot {slot}: {exc}")
                        result = {"status": "timeout", "actual": 0.0}

                # store result
                completed.append({
                    "slot": slot,
                    "name": name,
                    "target": target_grams,
                    "actual": result["actual"],
                    "status": result["status"],
                })

                # notify UI this spice is done
                _broadcast({
                    "type": "spice_complete",
                    "slot": slot,
                    "spice_name": name,
                    "actual": result["actual"],
                    "target": target_grams,
                    "status": result["status"],
                    "slot_index": idx,
                })

                # stop everything if something failed
                if result["status"] == "timeout":
                    _broadcast({
                        "type": "session_error",
                        "message": f"Slot {slot} ({name}) timed out.",
                        "completed": completed,
                    })
                    return

                # small delay between spices (only in mock mode)
                if MOCK_ARDUINO:
                    time.sleep(0.4)

            # all done
            _broadcast({
                "type": "session_complete",
                "recipe_name": recipe["name"],
                "completed": completed,
            })

        except Exception as exc:
            print(f"[Dispense] Unhandled error: {exc}")
            _broadcast({"type": "session_error", "message": str(exc), "completed": []})

        finally:
            _session.active = False  # always reset state

    # start background thread so server doesn't block
    _session.thread = threading.Thread(target=_run, daemon=True)
    _session.thread.start()

    return True, "Dispense started."


def is_busy() -> bool:
    # simple helper for checking state
    return _session.busy