"""
Dispense orchestration module: manages SSE client connections, MCU event
handling, and the main dispense loop.
"""
import queue
import random
import threading
import time
from typing import Optional

from config import MOCK_BRIDGE, SPICE_SLOTS

try:
    from arduino.app_utils import Bridge
except ImportError:
    Bridge = None

# SSE client registry -- holds message queues for each connected client
_sse_clients: list[queue.Queue] = []
_clients_lock = threading.Lock()


def register_sse_client() -> queue.Queue:
    """Register a new SSE client and return its message queue."""
    q: queue.Queue = queue.Queue(maxsize=50)
    with _clients_lock:
        _sse_clients.append(q)
    return q


def unregister_sse_client(q: queue.Queue) -> None:
    """Remove an SSE client from the registry."""
    with _clients_lock:
        try:
            _sse_clients.remove(q)
        except ValueError:
            pass


def _broadcast(event: dict) -> None:
    """Internal broadcast to all SSE clients."""
    print(f"[Broadcast] {event['type']} -> {len(_sse_clients)} clients")
    with _clients_lock:
        for q in _sse_clients:
            try:
                q.put_nowait(event)
            except queue.Full:
                pass


def broadcast(event: dict) -> None:
    """Public wrapper to broadcast an event to all SSE clients."""
    _broadcast(event)


# Spice-complete signal -- used to block and wait for MCU completion events
class _SpiceCompleteSignal:
    """Thread-safe signal to wait for spice completion from the MCU."""

    def __init__(self):
        self._event = threading.Event()
        self._result: dict = {}

    def wait(self, timeout_s: float) -> bool:
        return self._event.wait(timeout=timeout_s)

    def signal(self, result: dict) -> None:
        self._result = result
        self._event.set()

    def reset(self) -> None:
        self._event.clear()
        self._result = {}

    @property
    def result(self) -> dict:
        return self._result


_spice_signal = _SpiceCompleteSignal()


# Session state -- tracks active dispense session
class DispenseSession:
    def __init__(self) -> None:
        self.active = False
        self.thread: Optional[threading.Thread] = None

    @property
    def busy(self) -> bool:
        return self.active and self.thread is not None and self.thread.is_alive()


_session = DispenseSession()


"""
MCU -> Python push receivers
""" 
def handle_arduino_indexing(slot: int, spice_name: str, slot_index: int, total_slots: int) -> None:
    _broadcast(
        {
            "type": "indexing",
            "slot": slot,
            "spice_name": spice_name,
            "slot_index": slot_index,
            "total_slots": total_slots,
        }
    )


def handle_arduino_dispense_start(slot: int, spice_name: str, target_weight: float,
                                   slot_index: int, total_slots: int) -> None:
    _broadcast(
        {
            "type": "dispensing_start",
            "slot": slot,
            "spice_name": spice_name,
            "target_weight": target_weight,
            "slot_index": slot_index,
            "total_slots": total_slots,
        }
    )


def handle_arduino_no_bowl() -> None:
    _broadcast({"type": "no_bowl"})


def handle_arduino_bowl_detected() -> None:
    _broadcast({"type": "bowl_detected"})


def handle_arduino_weight_push(slot: int, current_weight: float, target_weight: float) -> None:
    _broadcast(
        {
            "type": "weight_update",
            "slot": slot,
            "current_weight": current_weight,
            "target_weight": target_weight,
        }
    )


def handle_arduino_spice_complete(slot: int, spice_name: str, actual: float,
                                   target: float, slot_index: int) -> None:
    data = {
        "type": "spice_complete",
        "slot": slot,
        "spice_name": spice_name,
        "actual": actual,
        "target": target,
        "status": "done",
        "slot_index": slot_index,
    }
    _broadcast(data)
    _spice_signal.signal(data)


def handle_arduino_session_complete(recipe_name: str) -> None:
    _session.active = False
    _broadcast(
        {
            "type": "session_complete",
            "recipe_name": recipe_name,
            "completed": [],
        }
    )


def handle_arduino_fault(message: str) -> None:
    _session.active = False
    _spice_signal.signal({"status": "fault"})
    _broadcast(
        {
            "type": "session_error",
            "message": message,
            "completed": [],
        }
    )


def handle_arduino_nearly_there(slot: int, spice_name: str) -> None:
    _broadcast(
        {
            "type": "nearly_there",
            "slot": slot,
            "spice_name": spice_name,
        }
    )


# Mock helper -- simulates the MCU dispensing without hardware/Bridge
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


def _friendly_error(exc: Exception) -> str:
    msg = str(exc)
    if "timeout" in msg.lower():
        return "MCU did not respond in time -- check the sketch is running."
    return "Hardware error -- check the MCU / Bridge connection."


def _stop_mcu() -> None:
    """Best-effort STOP call to the MCU. Replaces the old UDP STOP packet."""
    if MOCK_BRIDGE or Bridge is None:
        return
    try:
        Bridge.call("stop_dispense")
    except Exception as e:
        print(f"[Stop] Bridge call failed: {e}")


def _start_mcu_dispense(slot: int, grams: float, spice_name: str,
                        recipe_name: str, slot_index: int, total_slots: int) -> bool:
    """
    Ask the MCU to start dispensing one spice. Returns True once accepted.
    Retries while the MCU is busy waiting on the bowl, same as the old
    HTTP-POST retry loop, just over Bridge instead of the network.
    """
    return bool(
       Bridge.call(
            "start_dispense",
            int(slot) & 0xFF,
            float(grams),
            str(spice_name),
            str(recipe_name),
            int(slot_index) & 0xFF,
            int(total_slots) & 0xFF,
        )
    )


# Main dispense orchestration -- one background thread, one spice at a time.
def start_dispense(recipe: dict, serving_count: int) -> tuple[bool, str]:
    """
    Start a dispense session in a background thread.
    Sends one spice at a time to the MCU and waits for completion.
    """
    if _session.busy:
        return False, "A dispense is already in progress."

    spices = recipe.get("spices", [])
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

            for idx, (slot, name, grams) in enumerate(targets):
                if not _session.active:
                    break

                _spice_signal.reset()

                if MOCK_BRIDGE or Bridge is None:
                    result = _mock_dispense_spice(slot, grams)
                    handle_arduino_spice_complete(
                        slot, name, result["actual"], grams, idx
                    )
                else:
                    # Retry while the MCU is busy waiting for the bowl -- it won't accept a new start_dispense mid-tare.
                    accepted = False
                    deadline = time.time() + 120  # wait up to 2 min for bowl
                    while not accepted and time.time() < deadline:
                        if not _session.active:
                            return
                        try:
                            accepted = _start_mcu_dispense(
                                slot, grams, name, recipe["name"], idx, len(targets)
                            )
                            if not accepted:
                                print("[Dispense] MCU busy, retrying...")
                                time.sleep(1)
                        except Exception as exc:
                            print(f"[Dispense] Bridge call failed: {exc}")
                            time.sleep(1)

                    if not accepted:
                        _broadcast(
                            {
                                "type": "session_error",
                                "message": "MCU unreachable after 2 minutes.",
                                "completed": [],
                            }
                        )
                        return

                    # Block until the MCU calls push_spice_complete (or timeout)
                    completed = _spice_signal.wait(timeout_s=120)
                    if not completed or _spice_signal.result.get("status") == "fault":
                        _broadcast(
                            {
                                "type": "session_error",
                                "message": f"Timeout or fault on slot {slot}",
                                "completed": [],
                            }
                        )
                        return

            if _session.active:
                _broadcast(
                    {
                        "type": "session_complete",
                        "recipe_name": recipe["name"],
                        "completed": [n for _, n, _ in targets],
                    }
                )

        except Exception as exc:
            print(f"[Dispense] Error: {exc}")
            _broadcast(
                {
                    "type": "session_error",
                    "message": _friendly_error(exc),
                    "completed": [],
                }
            )
        finally:
            _session.active = False

    _session.thread = threading.Thread(target=_run, daemon=True)
    _session.thread.start()
    return True, "Dispense started."


def is_busy() -> bool:
    return _session.busy


def stop_dispense() -> None:
    """Called from Flask's /api/stop route."""
    _stop_mcu()
    _session.active = False
    _spice_signal.signal({"status": "fault"})
    broadcast({"type": "session_error", "message": "Cancelled by user", "completed": []})
