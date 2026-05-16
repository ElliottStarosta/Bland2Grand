import argparse
import json
import sys
import time
import subprocess
import platform

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    sys.exit("pyserial not found. Run: pip install pyserial")


# SERIAL PORT DETECTION
def find_arduino_port() -> str:
    candidates = list(serial.tools.list_ports.comports())
    print(f"[debug] All detected serial ports:")
    for p in candidates:
        print(f"         {p.device}  —  {p.description}")
    for p in candidates:
        desc = (p.description or "").lower()
        if any(k in desc for k in ("arduino", "ch340", "cp210", "usb")):
            return p.device
    if candidates:
        return candidates[0].device
    sys.exit("[error] No serial ports found.")


# PROVISION FUNCTION
def provision(port: str, ssid: str, password: str) -> None:
    print(f"\nPort:     {port}")
    print(f"SSID:     {ssid}")
    print(f"Password: {'*' * len(password)}")
    print()

    print(f"[debug] Opening {port} at 9600 baud...")
    try:
        ser = serial.Serial(port, 9600, timeout=1)
    except serial.SerialException as e:
        print(f"[error] Could not open port: {e}")
        print("        Is the PlatformIO serial monitor still open? Close it first.")
        return

    print(f"[debug] Port opened OK. Waiting 4s for Arduino to boot...")
    time.sleep(4.0)

    # Drain anything the Arduino already sent during boot
    waiting = ser.in_waiting
    if waiting:
        boot_output = ser.read(waiting).decode(errors="ignore")
        print(f"[debug] Arduino boot output ({waiting} bytes):")
        for line in boot_output.splitlines():
            print(f"         Arduino > {line}")
    else:
        print(f"[debug] No boot output received yet (Arduino may have booted before port opened).")

    ser.reset_input_buffer()

    # Build payload
    payload = json.dumps({
        "cmd": "provision",
        "ssid": ssid,
        "password": password
    }) + "\n"

    print(f"\n[debug] Sending JSON payload ({len(payload)} bytes):")
    print(f"         {payload.strip()}")
    ser.write(payload.encode())
    ser.flush()
    print(f"[debug] Payload sent. Waiting up to 20s for response...\n")

    deadline = time.time() + 20
    got_any_response = False

    while time.time() < deadline:
        line = ser.readline().decode(errors="ignore").strip()
        if line:
            got_any_response = True
            print(f"Arduino > {line}")

            if "PROV:OK" in line:
                print("\n✅ Provisioning complete.")
                ser.close()
                return
            if "PROV:FAIL" in line:
                print("\n❌ Provisioning failed — Arduino rejected the credentials.")
                print("   Check: cmd must be 'provision', ssid <= 32 chars, password <= 64 chars.")
                ser.close()
                return
            if "No WiFi credentials" in line or "Send JSON" in line:
                print("[debug] Arduino is in provisioning mode — good.")
            if "Connecting" in line:
                print("[debug] Arduino is trying to connect with saved credentials.")
                print("        It has already been provisioned. To re-provision:")
                print("        1. Flash clear_eeprom.cpp (see README)")
                print("        2. Power cycle and run provision.py immediately.")

    ser.close()

    if not got_any_response:
        print("\n⚠️  Timeout — Arduino sent NO response at all.")
        print()
        print("Possible causes:")
        print("  1. Arduino is NOT in provisioning mode (already has credentials in EEPROM).")
        print("     Fix: flash clear_eeprom.cpp to wipe EEPROM, then reflash main.cpp.")
        print()
        print("  2. Wrong baud rate — make sure main.cpp has Serial.begin(9600).")
        print("     NOT Serial.begin(9600).")
        print()
        print("  3. Arduino booted BEFORE this script opened the port.")
        print("     Fix: unplug Arduino, run this script, then plug Arduino back in.")
        print()
        print("  4. USB cable is power-only (no data lines).")
        print("     Fix: try a different cable.")
    else:
        print("\n⚠️  Timeout — got some output but no PROV:OK.")
        print("   See Arduino output above for clues.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port")
    parser.add_argument("--ssid")
    parser.add_argument("--password")
    parser.add_argument("--listen-only", action="store_true",
                        help="Just open the port and print everything Arduino sends (no provisioning)")
    args = parser.parse_args()

    # Listen-only mode: useful to see what Arduino is printing without sending anything
    if args.listen_only:
        port = args.port or find_arduino_port()
        print(f"[listen] Opening {port} at 9600. Press Ctrl+C to stop.\n")
        try:
            ser = serial.Serial(port, 9600, timeout=1)
        except serial.SerialException as e:
            sys.exit(f"[error] {e}")
        try:
            while True:
                line = ser.readline().decode(errors="ignore").strip()
                if line:
                    print(f"Arduino > {line}")
        except KeyboardInterrupt:
            ser.close()
            print("\n[listen] Closed.")
        return

    port = args.port or find_arduino_port()
    ssid = args.ssid
    password = args.password

    if not ssid:
        ssid = input("WiFi SSID: ").strip()
    if not password:
        import getpass
        password = getpass.getpass("WiFi Password: ")

    provision(port, ssid, password)


if __name__ == "__main__":
    main()