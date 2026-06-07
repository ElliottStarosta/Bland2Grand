# Bland2Grand backend

Flask server between the React UI and the Arduino. Recipe search, dispense sequencing, SSE progress stream, optional AI blends via OpenRouter.

## Data flow

```
Frontend  ←SSE→  Flask  ←HTTP/UDP→  Arduino
                    ↕
                 SQLite
                    ↕
              OpenRouter (optional)
```

**Mock mode** (`MOCK_ARDUINO=true`, default): simulates dispensing in Python — no hardware needed for UI work.

**Real mode** (`MOCK_ARDUINO=false`): POSTs each spice to the Arduino and waits for push callbacks before continuing.

## Files

| File | What it does |
|------|----------------|
| `app.py` | Route definitions (REST + SSE + Arduino push endpoints) |
| `config.py` | Reads `.env` |
| `database.py` | SQLite schema and recipe CRUD |
| `dispense.py` | Session thread, SSE broadcast, mock simulator, UDP weight listener |
| `search.py` | Category shortcut → name search → AI fallback |
| `ai_client.py` | OpenRouter JSON blend generation |
| `seed_recipes.py` | One-time ~100 recipe seed |
| `provision.py` | Push WiFi creds to Arduino over serial |
| `slot_config.py` | Shared slot names (generated from repo root) |

## Setup

```bash
cd bland2grand-backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
python seed_recipes.py         # safe to re-run (INSERT OR IGNORE)
python app.py
```

`.env` example:

```env
ARDUINO_URL=http://192.168.137.50
OPENROUTER_API_KEY=sk-or-...
AI_MODEL=anthropic/claude-3-haiku
DATABASE_PATH=bland2grand.db
FLASK_PORT=5000
MOCK_ARDUINO=true
```

## API (frontend-facing)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | `{ status, mock_arduino }` |
| GET | `/api/search?q=` | Up to 6 recipes; may hit AI if DB empty |
| GET | `/api/recipes/<id>` | Single recipe |
| POST | `/api/dispense` | `{ recipe_id, serving_count }` — starts background thread |
| GET | `/api/status/stream` | SSE — see event types below |
| POST | `/api/stop` | Cancel + UDP STOP to Arduino |
| POST | `/api/calibrate` | Update slot cal factor |
| POST | `/api/recipe` | Save custom blend |

## Arduino push routes

Called by firmware, not the browser:

| Method | Path | When |
|--------|------|------|
| POST | `/api/arduino/indexing` | Carousel moving |
| POST | `/api/arduino/dispense-start` | Auger started |
| POST | `/api/arduino/weight-push` | Live weight (HTTP or UDP relay) |
| POST | `/api/arduino/spice-complete` | One spice done — unblocks dispense loop |
| POST | `/api/arduino/session-complete` | All spices done |
| POST | `/api/arduino/fault` | Error |

Weight updates also arrive on **UDP port 5001** so the auger loop isn't blocked by HTTP.

## SSE events

`/api/status/stream` emits JSON lines:

| `type` | Useful fields |
|--------|----------------|
| `connected` | Handshake |
| `heartbeat` | Keep-alive |
| `session_start` | `recipe_name`, `slots[]` |
| `indexing` | `slot`, `spice_name`, `slot_index` |
| `dispensing_start` | `target_weight` |
| `weight_update` | `current_weight`, `target_weight` |
| `spice_complete` | `actual`, `target`, `status` |
| `session_complete` | `recipe_name` |
| `session_error` | `message` |

## Search logic

1. Query matches a cuisine keyword (`mexican`, `cajun`, …) → return that category.
2. Else SQL `LIKE` on recipe name.
3. Else call OpenRouter, save as `"AI Generated"`, return the new row.

No API key → step 3 is skipped.

## Database

**recipes** — `name`, `category`, `description`, plus `s1_cumin` … `s8_cayenne` (grams per serving).

**calibration** — per-slot `cal_factor` (HX711 counts per gram).

## WiFi provisioning

After flashing firmware:

```bash
python provision.py
# or
python provision.py --port COM3 --ssid MyNet --password secret
```

Sends JSON over serial; Arduino replies `PROV:OK`.

## Slot map

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
