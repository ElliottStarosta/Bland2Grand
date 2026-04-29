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
    for p in candidates:
        desc = (p.description or "").lower()
        if any(k in desc for k in ("arduino", "ch340", "cp210", "usb")):
            return p.device
    if candidates:
        return candidates[0].device
    sys.exit("[error] No serial ports found.")



# WIFI AUTO-DETECTION
def get_wifi_credentials():
    system = platform.system()

    try:
        if system == "Windows":
            # Get SSID
            ssid_cmd = "netsh wlan show interfaces"
            output = subprocess.check_output(ssid_cmd, shell=True).decode()
            ssid = None
            for line in output.splitlines():
                if "SSID" in line and "BSSID" not in line:
                    ssid = line.split(":")[1].strip()
                    break

            if not ssid:
                return None, None

            # Get password
            pass_cmd = f'netsh wlan show profile name="{ssid}" key=clear'
            output = subprocess.check_output(pass_cmd, shell=True).decode()

            password = None
            for line in output.splitlines():
                if "Key Content" in line:
                    password = line.split(":")[1].strip()
                    break

            return ssid, password

        elif system == "Darwin":  # macOS
            # SSID
            ssid_cmd = "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I"
            output = subprocess.check_output(ssid_cmd, shell=True).decode()

            ssid = None
            for line in output.splitlines():
                if " SSID:" in line:
                    ssid = line.split(":")[1].strip()
                    break

            if not ssid:
                return None, None

            # Password (requires keychain access)
            pass_cmd = f'security find-generic-password -ga "{ssid}" 2>&1'
            output = subprocess.check_output(pass_cmd, shell=True).decode()

            password = None
            for line in output.splitlines():
                if "password:" in line:
                    password = line.split(":")[1].strip().strip('"')
                    break

            return ssid, password

        else:
            # Linux (best effort)
            ssid_cmd = "iwgetid -r"
            ssid = subprocess.check_output(ssid_cmd, shell=True).decode().strip()
            return ssid, None  # password usually not accessible

    except Exception:
        return None, None



# PROVISION FUNCTION
def provision(port: str, ssid: str, password: str) -> None:
    print(f"\nPort: {port}")
    print(f"SSID: {ssid}")
    print(f"Password: {'*' * len(password)}")

    with serial.Serial(port, 115200, timeout=20) as ser:
        time.sleep(2.5)
        ser.reset_input_buffer()

        payload = json.dumps({
            "cmd": "provision",
            "ssid": ssid,
            "password": password
        }) + "\n"

        print("\n[info] Sending credentials...")
        ser.write(payload.encode())
        ser.flush()

        deadline = time.time() + 15
        while time.time() < deadline:
            line = ser.readline().decode(errors="ignore").strip()
            if line:
                print("Arduino >", line)
            if "PROV:OK" in line:
                print("\n✅ Provisioning complete.")
                return
            if "PROV:FAIL" in line:
                print("\n❌ Provisioning failed.")
                return

    print("\n⚠️ Timeout waiting for Arduino response.")



def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port")
    parser.add_argument("--ssid")
    parser.add_argument("--password")
    args = parser.parse_args()

    port = args.port or find_arduino_port()

    ssid = args.ssid
    password = args.password

    if not ssid:
        auto_ssid, auto_pass = get_wifi_credentials()
        if auto_ssid:
            print(f"[auto] Detected SSID: {auto_ssid}")
            ssid = auto_ssid
            if not password and auto_pass:
                password = auto_pass

    if not ssid:
        ssid = input("WiFi SSID: ").strip()

    if not password:
        password = input("WiFi Password: ").strip()

    provision(port, ssid, password)


if __name__ == "__main__":
    main()