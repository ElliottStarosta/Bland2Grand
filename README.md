# Bland2Grand
An 8-slot automatic spice dispenser controlled by an Arduino UNO R4 WiFi, with a Flask backend and a React touch-screen frontend. Search hundreds of recipes or build a custom blend — the machine weighs and dispenses each spice automatically.

---

## Quick Start — Running the App

Follow these steps every time you want to use the machine.

### Step 1 — Enable the Mobile Hotspot

On the Windows PC, turn on the **bland2grand** mobile hotspot before doing anything else.

> Settings → Network & Internet → Mobile hotspot → turn **On**

Make sure the hotspot is configured with these exact credentials:

| Field | Value |
|-------|-------|
| **Network name** | `bland2grand` |
| **Password** | `password` |

The Arduino connects to this network on boot. If the hotspot isn't on first, the Arduino won't get a WiFi connection.

---

### Step 2 — Power On the Arduino

Plug in the Arduino UNO R4 WiFi (USB or barrel jack). Watch the LED matrix on the board:

| Display | Meaning |
|---------|---------|
| **✕** (X) | Connecting to WiFi… |
| **✓** (Checkmark) | Connected — ready to receive commands |

Wait for the checkmark before continuing. If it stays on X for more than ~15 seconds, check that the hotspot is on and the credentials in `main.cpp` match.

---

### Step 3 — Start the Full Stack

In VS Code, open the **Command Palette** (`Ctrl + Shift + P`) and run:

```
Tasks: Run Task → Bland2Grand: Full Stack
```

This launches three things in parallel:

- **Flask backend** on `http://localhost:5000`
- **Vite frontend** on `http://localhost:5173`
- **Arduino serial monitor** (optional, for debugging)

Wait until the Vite terminal says `VITE ready` and the Flask terminal says `Starting Flask on port 5000`.

---

### Step 4 — Forward the Port in VS Code

To access the app from your phone, you need to forward and publicize port **5173**.

1. Open the **Ports** panel in VS Code
   (`View → Open View… → Ports`, or look for the **PORTS** tab in the bottom panel)

2. Click **Forward a Port** and enter `5173`

3. Once the port appears in the list, **right-click** the forwarded address row

4. Go to **Port Visibility → Public**

> The port must be **Public** for your phone to access it over the internet tunnel. A private port only works from the same machine.

---

### Step 5 — Open the App

**On your phone (or any device):**
Copy the forwarded URL from the Ports panel — it looks like:

```
https://w7wkw5k9-5173.use.devtunnels.ms/
```

Open that link in your phone's browser.

**On the PC:**
Go to `http://localhost:5173`

The app will show the Bland2Grand idle screen. Tap anywhere to wake it, search for a recipe, and dispense!

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Arduino stuck on ✕ | Check the hotspot is on; verify SSID/password in `main.cpp` |
| App loads but dispense fails | Check Flask is running; verify `FLASK_SERVER_HOST` in `Constants.h` matches the PC's hotspot IP (`192.168.137.1`) |
| Port forwarding link doesn't work on phone | Make sure Port Visibility is set to **Public**, not Private |
| Serial monitor won't open | Close any other program using the COM port (e.g. Arduino IDE serial monitor) |
| Arduino not found on serial | Unplug and replug USB; check Device Manager for the correct COM port |

---

## Project Overview

```
Bland2Grand/
├ Bland2Grand_Arduino/       # PlatformIO firmware (C++)
│   └ src/
│       ├ main.cpp           # Entry point — WiFi, HTTP server, dispense state machine
│       ├ Constants.h        # All pin assignments, motor tuning, WiFi config
│       └ ...                # Carousel, Auger, Scale, FlowModel modules
│
├ bland2grand-backend/       # Flask API server (Python)
│   ├ app.py                 # All REST + SSE endpoints
│   ├ dispense.py            # Dispense orchestration, mock mode
│   ├ search.py              # Recipe search + AI fallback (OpenRouter)
│   └ seed_recipes.py        # Seed ~100 curated recipes into SQLite
│
├ bland2grand-frontend/      # React touch UI (TypeScript + Vite)
│   └ src/
│       ├ App.tsx            # Screen router, idle timer
│       ├ screens/           # Search, Results, Serving, Dispensing, Complete
│       └ hooks/             # SSE stream manager, debounce, audio
│
└ .vscode/
    └ tasks.json             # VS Code task definitions
```

---

## Development Setup (First Time)

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Python](https://python.org/) ≥ 3.11
- [PlatformIO](https://platformio.org/) (VS Code extension or CLI)

### Backend

```bash
cd bland2grand-backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
python seed_recipes.py         # Populate the recipe database (run once)
```

Create a `.env` file in `bland2grand-backend/`:

```env
ARDUINO_URL=http://192.168.137.50
OPENROUTER_API_KEY=sk-or-...        # Optional — enables AI recipe generation
AI_MODEL=anthropic/claude-3-haiku
DATABASE_PATH=bland2grand.db
FLASK_PORT=5000
MOCK_ARDUINO=true                   # Set to false when running with real hardware
```

### Frontend

```bash
cd bland2grand-frontend
npm install
```

### Arduino

Open `Bland2Grand_Arduino/` in VS Code with PlatformIO installed. Update WiFi credentials at the top of `src/main.cpp`:

```cpp
const char *WIFI_SSID     = "bland2grand";
const char *WIFI_PASSWORD = "your_password";
```

Flash with the **Arduino: Flash** task or `pio run --target upload`.

---

## Hardware & Assembly

> Assembly instructions, wiring diagrams, and calibration procedures will be documented here.

### Bill of Materials

| Component | Quantity |
|-----------|----------|
| Arduino UNO R4 WiFi | 1 |
| NEMA 23 stepper + TB6600 driver (carousel) | 1 |
| NEMA 17 stepper + TB6600 driver (auger) | 1 |
| HX711 load cell amplifier + load cell | 1 |

### Pin Reference

| Signal | Arduino Pin |
|--------|-------------|
| Carousel STEP | D5 |
| Carousel DIR | D7 |
| Auger STEP | D3 |
| Auger DIR | D4 |
| HX711 DOUT | D9 |
| HX711 SCK | D10 |

---

## Slot Mapping

| Slot | Spice |
|------|-------|
| 1 | Cumin |
| 2 | Paprika |
| 3 | Garlic Powder |
| 4 | Salt |
| 5 | Oregano |
| 6 | Onion Powder |
| 7 | Black Pepper |
| 8 | Cayenne |
