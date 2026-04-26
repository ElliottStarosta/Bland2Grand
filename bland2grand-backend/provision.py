"""
provision.py
============
Sends WiFi credentials to the Arduino over USB serial so you never have to
hardcode SSID / password in main.cpp.

The Arduino reads one JSON line on startup (within the first 5 seconds):
    {"cmd":"provision","ssid":"MyNetwork","password":"MyPassword"}

It saves the credentials to EEPROM and replies "PROV:OK".
On every subsequent boot it loads from EEPROM and connects automatically.

Usage:
    python provision.py                          # auto-detects port, prompts for creds
    python provision.py --port /dev/ttyACM0     # Linux
    python provision.py --port COM3              # Windows
    python provision.py --port /dev/cu.usbmodem14101  # macOS

Requirements:
    pip install pyserial
"""

import argparse
import json
import sys
import time

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    sys.exit("pyserial not found.  Run:  pip install pyserial")


def find_arduino_port() -> str:
    candidates = list(serial.tools.list_ports.comports())
    for p in candidates:
        desc = (p.description or "").lower()
        mfr = (p.manufacturer or "").lower()
        if any(
            k in desc or k in mfr
            for k in ("arduino", "ch340", "cp210", "ftdi", "renesas")
        ):
            return p.device
    if candidates:
        print(f"[warn] No obvious Arduino port. Trying: {candidates[0].device}")
        return candidates[0].device
    sys.exit("[error] No serial ports found. Is the Arduino plugged in?")


def provision(port: str, ssid: str, password: str) -> None:
    print(f"\n  Port:     {port}")
    print(f"  SSID:     {ssid}")
    print(f"  Password: {'*' * len(password)}\n")
    print(f"[info] Opening {port} at 115200 baud …")

    with serial.Serial(port, 115200, timeout=20) as ser:
        # Wait for Arduino to finish its USB-CDC reset
        time.sleep(2.5)
        ser.reset_input_buffer()

        payload = (
            json.dumps(
                {
                    "cmd": "provision",
                    "ssid": ssid,
                    "password": password,
                }
            )
            + "\n"
        )

        print("[info] Sending credentials …")
        ser.write(payload.encode())
        ser.flush()

        deadline = time.time() + 15
        while time.time() < deadline:
            raw = ser.readline()
            if not raw:
                continue
            line = raw.decode(errors="replace").strip()
            if line:
                print(f"  Arduino › {line}")
            if "PROV:OK" in line:
                print("\n✅  Done. Arduino will connect to this network on next boot.")
                return
            if "PROV:FAIL" in line:
                print("\n❌  Arduino reported failure -- check the output above.")
                return

    print("\n⚠️  Timed out. Open the serial monitor to see what happened.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Provision WiFi credentials to the Bland2Grand Arduino"
    )
    parser.add_argument("--port", help="Serial port (auto-detected if omitted)")
    parser.add_argument("--ssid", help="WiFi SSID (prompted if omitted)")
    parser.add_argument("--password", help="WiFi password (prompted if omitted)")
    args = parser.parse_args()

    port = args.port or find_arduino_port()
    ssid = args.ssid or input("WiFi SSID:     ").strip()
    password = args.password or input("WiFi password: ").strip()

    if not ssid:
        sys.exit("[error] SSID cannot be empty.")

    provision(port, ssid, password)


if __name__ == "__main__":
    main()
