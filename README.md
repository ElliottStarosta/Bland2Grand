# Bland2Grand

An 8-slot automatic spice dispenser: Arduino moves the carousel and runs the auger, Flask handles recipes and dispense orchestration, and a React touch UI is what you actually tap on.

Search for a recipe (or build your own blend), pick servings, and the machine weighs out each spice in order.

## How the pieces fit together

```
Phone/browser  →  React UI (port 5173)
                      ↓ REST + SSE
                 Flask backend (port 5000)
                      ↓ HTTP + UDP
                 Arduino UNO R4 WiFi (port 80)
                      ↓ GPIO
                 Carousel, auger, load cell
```

The frontend never talks to the Arduino directly. Flask sends one spice command at a time, the Arduino pushes weight/progress events back, and Flask fans those out over Server-Sent Events to whoever is watching the dispense screen.

## Weekly Engineering Journals

The project was documented throughout development in a series of weekly engineering journals covering design decisions, hardware integration, software development, testing, and project management.

- [Week 1 Journal](https://lying-denim-736.notion.site/Journal-1-33765230a78b8010af24f441907a132c?pvs=73)
- [Week 2 Journal](https://lying-denim-736.notion.site/Journal-2-33765230a78b808d91aac0a6b3ddb459?pvs=73)
- [Week 3 Journal](https://lying-denim-736.notion.site/Journal-3-33765230a78b80e9b983e4aa1db35312?pvs=4)
- [Week 4 Journal](https://lying-denim-736.notion.site/Journal-4-33765230a78b8081bd38f594ebceb503?pvs=73)
- [Week 5 Journal](https://lying-denim-736.notion.site/Journal-5-33765230a78b80ebb033f5e4358f1c1f)
- [Week 6 Journal](https://lying-denim-736.notion.site/Journal-6-33765230a78b804fb087c1ad0b55b3ff?source=copy_link)
- [Week 7 Journal](https://lying-denim-736.notion.site/Journal-7-33765230a78b80bd848ce638972f48d1?pvs=74)
- [Week 8 Journal](https://lying-denim-736.notion.site/Journal-8-33765230a78b806ebfbeec2ee93a6579?pvs=74)
- [Week 9 Journal](https://lying-denim-736.notion.site/Journal-9-33765230a78b80528cf1d645e4d33567?pvs=74)
- [Week 10 Journal](https://lying-denim-736.notion.site/Journal-10-34865230a78b807989e8eb5f8e950e21?pvs=74)

## Running it day-to-day

### 1. Turn on the hotspot

On the Windows PC, enable the **bland2grand** mobile hotspot before powering the Arduino.

Settings → Network & Internet → Mobile hotspot → On

| Field | Value |
|-------|-------|
| Network name | `bland2grand` |
| Password | `password` |

The Arduino joins this network on boot. If the hotspot comes up late, you'll see an X on the LED matrix until it reconnects.

### 2. Power the Arduino

Plug in the UNO R4 WiFi. The onboard LED matrix shows:

| Display | Meaning |
|---------|---------|
| ✕ | Still connecting to WiFi |
| ✓ | Connected — ready for commands |

If it sits on ✕ for ~15s, check hotspot credentials in `Bland2Grand_Arduino/src/main.cpp`.

### 3. Start backend + frontend

In VS Code: **Command Palette** (`Ctrl+Shift+P`) → **Tasks: Run Task** → **Bland2Grand: Full Stack**

That starts Flask on `http://localhost:5000`, Vite on `http://localhost:5173`, and optionally the serial monitor.

Wait for `VITE ready` and `Starting Flask on port 5000`.

### 4. Forward port 5173 (phone access)

1. Open the **Ports** panel (`View → Open View… → Ports`)
2. **Forward a Port** → enter `5173`
3. Right-click the row → **Port Visibility → Public**

Private visibility only works on the same machine; Public is what you need for a phone on the dev tunnel.

### 5. Open the app

**Phone:** copy the forwarded URL from Ports (e.g. `https://xxxx-5173.use.devtunnels.ms/`)

**PC:** `http://localhost:5173`

Tap the idle screen to wake it, search, dispense.

## Troubleshooting

| Symptom | What to try |
|---------|-------------|
| Arduino stuck on ✕ | Hotspot on? SSID/password match `main.cpp`? |
| Dispense fails, UI loads fine | Flask running? `FLASK_SERVER_HOST` in firmware matches PC IP (`192.168.137.1` on hotspot) |
| Tunnel link dead on phone | Port visibility set to **Public** |
| Serial monitor won't open | Another app (Arduino IDE?) has the COM port |
| No COM port | Replug USB, check Device Manager |

## Repo layout

```
Bland2Grand/
├── Bland2Grand_Arduino/     PlatformIO firmware (carousel, auger, scale, WiFi)
├── bland2grand-backend/     Flask API, SQLite recipes, dispense loop
├── bland2grand-frontend/    React kiosk UI
├── generate_slots.py        Regenerates shared slot config from spice_slots.json
└── .vscode/tasks.json       One-click full-stack task
```

Each subfolder has its own README with more detail.

## Updating spice slots

The spice carousel configuration is stored in `spice_slots.json`.

Each slot entry defines:

* `name` — spice name shown in the UI
* `density_g_ml` — bulk density used for calculations
* `grams_per_rev` — grams dispensed per auger revolution
* `color` — UI display color

Example:

```json
"1": {
  "name": "Salt",
  "density_g_ml": 1.22,
  "grams_per_rev": 0.125,
  "color": "#E8EEF2"
}
```

When changing the spices loaded into the machine:

1. Edit `spice_slots.json`.
2. Update the appropriate slot entries.
3. Keep slot numbers in **strict numerical order** (`1, 2, 3, ...`).
4. Do not duplicate slot numbers.
5. Run:

```bash
python generate_slots.py
```

This regenerates the shared slot configuration used by the frontend, backend, and Arduino firmware.

If `generate_slots.py` is not run after modifying `spice_slots.json`, the machine may display incorrect spice names or dispense from the wrong slot.

## First-time dev setup

**Needs:** Node 18+, Python 3.11+, PlatformIO (VS Code extension is fine)

**Backend**

```bash
cd bland2grand-backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python seed_recipes.py    # once, to fill the recipe DB
```

Create `bland2grand-backend/.env`:

```env
ARDUINO_URL=http://192.168.137.50
OPENROUTER_API_KEY=sk-or-...     # optional — AI blends when search misses
AI_MODEL=anthropic/claude-3-haiku
DATABASE_PATH=bland2grand.db
FLASK_PORT=5000
MOCK_ARDUINO=true                # false when hardware is on the network
```

**Frontend**

```bash
cd bland2grand-frontend
npm install
```

**Arduino**

Open `Bland2Grand_Arduino/` in VS Code with PlatformIO. WiFi creds live at the top of `src/main.cpp`. Flash via the **Arduino: Flash** task or `pio run --target upload`.

## Hardware (quick reference)

| Part | Role |
|------|------|
| Arduino UNO R4 WiFi | Main controller |
| NEMA 23 + TB6600 | Carousel |
| NEMA 17 + TB6600 | Auger |
| HX711 + load cell | Weight feedback |

| Signal | Arduino Pin |
|--------|-------------|
| Carousel STEP | D5 |
| Carousel DIR | D7 |
| Auger STEP | D3 |
| Auger DIR | D4 |
| HX711 SCK | A0 |
| HX711 DOUT | A1 |
