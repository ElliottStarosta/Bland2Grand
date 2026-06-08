# Bland2Grand Arduino firmware

PlatformIO project for the **Arduino UNO R4 WiFi**. Drives carousel indexing, auger dispensing, load-cell feedback, and talks to Flask over WiFi.

## What runs where

`main.cpp` is the production sketch. It spins a small state machine:

```
IDLE → INDEXING → DISPENSING → PARKING → (next spice or done)
```

- **INDEXING** — carousel steps to the target slot (shortest CCW path).
- **DISPENSING** — auger runs; weight pushed over UDP so HTTP doesn't stall steps.
- **PARKING** — half-rev forward to disengage the spur gear and avoid drips.

`USE_LOAD_CELL` in `main.cpp` picks closed-loop (HX711) vs dead-reckoning (cycle counts only).

## Hardware

| Part | Job |
|------|-----|
| UNO R4 WiFi | Controller + LED matrix status |
| NEMA 23 + TB6600 | 8-slot carousel |
| NEMA 17 + TB6600 | Auger / half-spur gear |
| HX711 + load cell | Gram feedback (optional) |
### Pins (see `Constants.h`)

| Signal | Pin |
|--------|-----|
| Carousel STEP / DIR | D5 / D7 |
| Auger STEP / DIR | D3 / D4 |
| HX711 DOUT / SCK | A1 / A0 |

## Source files

| File | Role |
|------|------|
| `main.cpp` | WiFi, HTTP :80, dispense FSM |
| `Constants.h` | Pins, speeds, gram/rev estimates |
| `CarouselDriver.h` | Slot indexing |
| `AugerDriver.h` | Bulk → settle → nudge dispense |
| `Scale.h` | HX711 wrapper |
| `WiFiComms.h` | WiFi, HTTP server, Flask pushes, UDP weight |
| `SlotConfig.h` | Generated spice names |

## Closed-loop dispense (load cell)

AugerDriver runs three phases when `USE_LOAD_CELL=1`:

1. **Bulk** — fast run to ~85% of target by cycle count (scale is noisy while spinning).
2. **Settle** — stop, wait for stable reads.
3. **Nudge** — one auger cycle at a time until target or max taps.

Per-slot coast EMA learns how much spice keeps falling after the motor stops.

After each spice the auger reverses (back-purge) to re-seat the half-spur gear.

## WiFi

Static IP default: `192.168.137.50` on the `bland2grand` hotspot (gateway `192.168.137.1`).

Credentials at top of `main.cpp`. First boot with empty EEPROM can accept serial provisioning — see backend `provision.py`.

Flask push target is `FLASK_SERVER_HOST` in `Constants.h`.

UDP: weight → port 5001 on the PC, STOP command listened on 8889.

## Build & flash

```bash
pio run
pio run --target upload
pio device monitor --baud 9600
```

VS Code task **Arduino: Flash** works too.


## PlatformIO libs

```
AccelStepper, HX711, AS5600, ArduinoJson, ArduinoOTA
```

(listed in `platformio.ini`)


## EEPROM map (approximate)

| Address | Content |
|---------|---------|
| 0–63 | FlowModel per slot (legacy) |
| 128–143 | Carousel position backup |
| 200–297 | WiFi SSID/password |

Exact layout may vary — check `FlowModel.h` / `WiFiComms.h` if you're poking EEPROM directly.
