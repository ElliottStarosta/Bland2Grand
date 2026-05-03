# Bland2Grand — Arduino Firmware

Firmware for the **Arduino UNO R4 WiFi** that drives the Bland2Grand automatic spice dispenser. Built with PlatformIO and the Arduino framework.

---

## Overview

The firmware manages all real-time hardware control: carousel positioning, auger dispensing, load-cell weighing, and WiFi communication back to the Flask backend. A finite state machine (`StateMachine`) coordinates every phase of a dispense session.

---

## Hardware

| Component | Role |
|-----------|------|
| Arduino UNO R4 WiFi | Main controller |
| NEMA 23 + TB6600 (M1) | Carousel rotation |
| NEMA 17 + TB6600 (M2) | Auger / half-spur gear |
| HX711 + load cell | Closed-loop weight feedback |
| AS5600 (I²C) | Magnetic encoder for carousel position |

### Pin Assignments

| Signal | Pin |
|--------|-----|
| Carousel STEP | D3 |
| Carousel DIR | D4 |
| Auger STEP | D5 |
| Auger DIR | D7 |
| HX711 DOUT | D9 |
| HX711 SCK | D10 |
| AS5600 SDA/SCL | A4 / A5 (hardware I²C) |

---

## Project Structure

```
Bland2Grand_Arduino/
├── src/
│   ├── main.cpp              # Entry point — setup() and loop()
│   ├── Constants.h           # All pin, geometry, and tuning constants
│   ├── StateMachine.h        # Top-level FSM (HOMING → IDLE → INDEXING → DISPENSING → DONE)
│   ├── Carousel.h            # Carousel stepper control + closed-loop encoder correction
│   ├── CarouselPosition.h    # EEPROM-backed position fusion (encoder + steps)
│   ├── Auger.h               # Auger stepper, 3-stage speed ramp, back-purge
│   ├── Scale.h               # HX711 wrapper — tare, averaged reads, overload detection
│   ├── Encoder.h             # AS5600 wrapper — raw angle, signed error, wraparound math
│   ├── FlowModel.h           # Online linear regression, coast estimation, EEPROM persistence
│   ├── WiFiComm.h            # Outbound HTTP push to Flask (dispense events, weight updates)
│   └── WiFiManager.h         # WiFi credential storage & serial provisioning
├── src/tests/
│   ├── auger.cpp             # Standalone auger forward/backward test
│   ├── carousel.cpp          # Interactive carousel slot-seek test (Serial input)
│   └── encoder_cal.cpp       # AS5600 calibration utility — prints raw angle + magnet status
├── platformio.ini            # Build configuration
└── include/                  # (reserved for shared headers)
```

---

## State Machine

```
HOMING → IDLE → INDEXING → DISPENSING → DONE → IDLE
                                              ↘ FAULT
```

- **HOMING** — Scans carousel until AS5600 reads `MODULE_1_SHAFT_COUNTS`, zeroes the stepper.
- **IDLE** — Runs a minimal HTTP server on port 80 waiting for a `POST /` dispense command from Flask.
- **INDEXING** — Moves carousel to the target slot; closed-loop encoder correction.
- **DISPENSING** — Runs auger with 3-stage speed ramp; polls scale every `SCALE_POLL_MS`; pushes live weight to Flask every `WIFI_PUSH_INTERVAL_MS`.
- **DONE** — Records coast overshoot, saves FlowModel to EEPROM, pushes result to Flask.
- **FAULT** — Broadcasts fault message; requires power cycle.

---

## Key Algorithms

### 3-Stage Speed Ramp (Auger)

| Phase | Weight ratio | Speed |
|-------|-------------|-------|
| Stage 1 | < 80 % of target | 100 % |
| Stage 2 | 80–95 % | 50 % |
| Stage 3 | > 95 % | 15 % |

### FlowModel (Online Regression)

Accumulates `(auger_cycles, weight)` observations per slot using online least-squares. After each dispense, the measured coast (in-flight grams after motor stop) is folded into an exponential moving average (`α = 0.3`). `predictStopWeight()` subtracts the estimated coast from the target so the final reading lands on target.

### Back-Purge

After every dispense the auger reverses by exactly the number of steps taken. This sweeps powder back up the helix and re-parks the toothless arc of the half-spur gear, preventing drips between dispenses.

---

## WiFi Provisioning

On first boot (no credentials in EEPROM) the firmware waits 30 seconds for a JSON payload over Serial:

```json
{"cmd": "provision", "ssid": "YourNetwork", "password": "yourpassword"}
```

Use the helper script in the backend folder:

```bash
python bland2grand-backend/provision.py
```

---

## Dependencies (PlatformIO)

```ini
lib_deps =
    waspinator/AccelStepper@^1.64
    bogde/HX711@^0.7.5
    robtillaart/AS5600@^0.6.7
    bblanchon/ArduinoJson@^7.2.2
    jandrassy/ArduinoOTA@^1.1.1
```

---

## Build & Flash

```bash
# Build
pio run

# Flash
pio run --target upload

# Serial monitor
pio device monitor --baud 115200
```

### Running a Test Sketch

Edit `platformio.ini` to point `build_src_filter` at the desired test file, e.g.:

```ini
build_src_filter = +<tests/carousel.cpp> -<main.cpp>
```

---

## Calibration

1. Flash `encoder_cal.cpp` and open the serial monitor.
2. Manually rotate the carousel until slot 1 is aligned under the auger tube.
3. Read the `Raw` value printed to Serial.
4. Update `MODULE_1_SHAFT_COUNTS` in `Constants.h` and reflash `main.cpp`.

---

## EEPROM Layout

| Address | Content |
|---------|---------|
| 0–63 | FlowModel — 8 slots × 16 bytes (slope, intercept, coast, n_samples) |
| 64–127 | *(reserved)* |
| 128–143 | CarouselPosition — slot, encoder counts, step position, magic byte |
| 200–297 | WiFi credentials — SSID (33 B), password (65 B), magic byte |
