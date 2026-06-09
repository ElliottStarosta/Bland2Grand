"""
Dispense orchestration: SSE fan-out, Arduino push handlers, mock mode.

Flask posts one spice at a time to the Arduino and waits for a push back
before moving on. The frontend listens on /api/status/stream for live updates.
"""

import queue
import random
import threading
import socket
import json
import time
from typing import Optional
import subprocess
import sys


import requests
from config import ARDUINO_URL, MOCK_ARDUINO, SPICE_SLOTS

# SSE client registry
_sse_clients: list[queue.Queue] = []
_clients_lock = threading.Lock()

# Session state
_udp_thread: threading.Thread | None = None


# UDP listener — Arduino sends weight updates here to avoid blocking its step loop.
def _udp_listener() -> None:
    if sys.platform == "win32":
        try:
            result = subprocess.check_output("netstat -ano", shell=True).decode()
            pids = set()
            for line in result.strip().splitlines():
                if ":5001" in line:
                    parts = line.split()
                    if parts:
                        pids.add(parts[-1])
            for pid in pids:
                if pid.isdigit():
                    subprocess.call(f"taskkill /PID {pid} /F",
                                    shell=True,
                                    stdout=subprocess.DEVNULL,
                                    stderr=subprocess.DEVNULL)
                    print(f"[UDP] Killed PID {pid} on port 5001")
        except Exception as e:
            print(f"[UDP] Pre-kill failed: {e}")
        time.sleep(0.5)

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("0.0.0.0", 5001))
    sock.settimeout(1.0)
    print("[UDP] Listening on port 5001")
    while True:
        try:
            data, addr = sock.recvfrom(256)
            print(f"[UDP] GOT: {data.decode()}")
            payload = json.loads(data.decode())
            handle_arduino_weight_push(payload)
        except socket.timeout:
            continue
        except Exception as e:
            print(f"[UDP] Error: {e}")

def start_udp_listener() -> None:
    global _udp_thread
    if _udp_thread and _udp_thread.is_alive():
        return
    _udp_thread = threading.Thread(target=_udp_listener, daemon=True)
    _udp_thread.start()


start_udp_listener()


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


# Spice-complete signal
class _SpiceCompleteSignal:
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


def handle_arduino_no_bowl(data: dict) -> None:
    _broadcast(
        {
            "type": "no_bowl",
        }
    )


def handle_arduino_bowl_detected(data: dict) -> None:
    _broadcast(
        {
            "type": "bowl_detected",
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
    """Arduino finished one spice -- broadcast and unblock the dispense loop."""
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
    _spice_signal.signal(data)


def handle_arduino_session_complete(data: dict) -> None:
    """Arduino signals the full session is done (all spices dispensed)."""
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


def handle_arduino_nearly_there(data: dict) -> None:
    _broadcast(
        {
            "type": "nearly_there",
            "slot": data.get("slot"),
            "spice_name": data.get("spice_name", ""),
        }
    )


def _friendly_error(exc: Exception) -> str:
    msg = str(exc)
    if "ConnectTimeoutError" in msg or "connect timeout" in msg.lower():
        return "Arduino unreachable -- check it is powered and on the network."
    if "ConnectionRefusedError" in msg or "Connection refused" in msg:
        return "Arduino refused connection -- check it is running."
    if "Max retries exceeded" in msg:
        return "Could not reach Arduino -- check WiFi and IP address."
    return "Hardware error -- check Arduino connection."


# Main dispense orchestration — one background thread, one spice POST at a time.
def start_dispense(recipe: dict, serving_count: int) -> tuple[bool, str]:
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

                payload = {
                    "carousel": slot,
                    "grams": grams,
                    "spice_name": name,
                    "recipe_name": recipe["name"],
                    "slot_index": idx,
                    "total_slots": len(targets),
                }

                # POST one spice — retry silently while Arduino is waiting for bowl
                # (Arduino won't respond to HTTP during bowl detection / tare)
                posted = False
                post_deadline = time.time() + 120  # wait up to 2 min for bowl
                while not posted and time.time() < post_deadline:
                    if not _session.active:
                        return
                    try:
                        resp = requests.post(
                            f"{ARDUINO_URL}/",
                            json=payload,
                            timeout=5,
                        )
                        if resp.status_code == 200:
                            posted = True
                        elif resp.status_code == 409:
                            # Arduino busy — wait and retry
                            print(f"[Dispense] Arduino busy (409), retrying...")
                            time.sleep(1)
                        else:
                            raise RuntimeError(f"Arduino returned {resp.status_code}")
                    except requests.exceptions.ConnectionError:
                        # Arduino not responding — likely mid-tare or bowl wait, retry silently
                        print(
                            f"[Dispense] Arduino not responding, retrying (bowl wait?)..."
                        )
                        time.sleep(1)
                    except requests.exceptions.Timeout:
                        print(f"[Dispense] Arduino timeout, retrying...")
                        time.sleep(1)
                    except Exception as exc:
                        print(f"[Dispense] Failed to reach Arduino: {exc}")
                        _broadcast(
                            {
                                "type": "session_error",
                                "message": _friendly_error(exc),
                                "completed": [],
                            }
                        )
                        return

                if not posted:
                    _broadcast(
                        {
                            "type": "session_error",
                            "message": "Arduino unreachable after 2 minutes.",
                            "completed": [],
                        }
                    )
                    return

                # Block until Arduino pushes spice-complete (or timeout)
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
