# Bland2Grand — Web Backend

Flask API server that sits between the React frontend and the Arduino hardware. Handles recipe search, AI-generated blends, dispense orchestration, and real-time Server-Sent Events (SSE) for live progress streaming.

---

## Overview

```
Frontend  ←──SSE──→  Flask Backend  ←──HTTP──→  Arduino UNO R4 WiFi
              REST                    push
                   ↕
              SQLite DB
                   ↕
           OpenRouter AI API
```

The backend operates in two modes controlled by the `MOCK_ARDUINO` environment variable:

- **Mock mode** (`MOCK_ARDUINO=true`, default) — simulates dispensing locally for UI development without any hardware.
- **Real mode** (`MOCK_ARDUINO=false`) — sends commands to the Arduino and waits for push callbacks.

---

## Project Structure

```
bland2grand-backend/
├── app.py              # Flask application — all route definitions
├── config.py           # Environment variable loading (dotenv)
├── database.py         # SQLite schema, CRUD helpers
├── dispense.py         # Dispense orchestration, SSE broadcast, mock simulation
├── search.py           # Recipe search — DB lookup → AI fallback
├── ai_client.py        # OpenRouter API client (Claude / other LLMs)
├── seed_recipes.py     # One-time DB seeding script (~100 curated recipes)
├── provision.py        # Serial provisioning helper for Arduino WiFi credentials
└── requirements.txt    # Python dependencies
```

---

## API Reference

### General

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check — returns mock mode status |
| `GET` | `/api/search?q=...` | Search recipes by name or cuisine category |
| `GET` | `/api/recipes/<id>` | Fetch a single recipe by ID |
| `POST` | `/api/dispense` | Start a dispense session |
| `GET` | `/api/status/stream` | SSE stream — real-time dispense progress |
| `POST` | `/api/calibrate` | Update per-slot calibration factor |
| `POST` | `/api/recipe` | Save a custom recipe |

### Arduino Push Endpoints

These are called by the Arduino (not the frontend):

| Method | Path | Triggered when… |
|--------|------|-----------------|
| `POST` | `/api/arduino/indexing` | Carousel starts rotating |
| `POST` | `/api/arduino/dispense-start` | Auger begins dispensing a spice |
| `POST` | `/api/arduino/weight-push` | Live weight update (~150 ms interval) |
| `POST` | `/api/arduino/spice-complete` | One spice finished |
| `POST` | `/api/arduino/session-complete` | All spices in the recipe finished |
| `POST` | `/api/arduino/fault` | Hardware fault |

### SSE Event Types

The `/api/status/stream` endpoint emits JSON events:

| `type` | Payload fields |
|--------|---------------|
| `connected` | — |
| `heartbeat` | — |
| `session_start` | `recipe_name`, `total_slots`, `slots[]` |
| `indexing` | `slot`, `spice_name`, `slot_index`, `total_slots` |
| `dispensing_start` | `slot`, `spice_name`, `target_weight`, `slot_index`, `total_slots` |
| `weight_update` | `slot`, `current_weight`, `target_weight` |
| `spice_complete` | `slot`, `spice_name`, `actual`, `target`, `status`, `slot_index` |
| `session_complete` | `recipe_name`, `completed[]` |
| `session_error` | `message`, `completed[]` |

---

## Setup

### 1. Install dependencies

```bash
cd bland2grand-backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure environment

Create a `.env` file in `bland2grand-backend/`:

```env
ARDUINO_URL=http://192.168.2.xxx      # Arduino IP (real mode only)
OPENROUTER_API_KEY=sk-or-...          # For AI recipe generation
AI_MODEL=anthropic/claude-3-haiku     # Model string
DATABASE_PATH=bland2grand.db
FLASK_PORT=5000
MOCK_ARDUINO=true                     # Set false for real hardware
```

### 3. Seed the database

```bash
python seed_recipes.py
```

This inserts ~100 curated recipes across 20+ cuisine categories. Safe to re-run — uses `INSERT OR IGNORE`.

### 4. Run the server

```bash
python app.py
```

Server starts on `http://0.0.0.0:5000`.

---

## Recipe Search

1. **Category match** — if the query matches a known cuisine keyword (e.g. `"mexican"`, `"cajun"`), returns all recipes in that category.
2. **Name search** — SQL `LIKE` query against recipe names.
3. **AI fallback** — if no local results, queries OpenRouter with a structured prompt and saves the generated blend to the DB for future searches.

---

## Database Schema

### `recipes`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `name` | TEXT UNIQUE | |
| `category` | TEXT | e.g. `"Mexican"`, `"AI Generated"` |
| `description` | TEXT | |
| `s1_cumin` … `s8_cayenne` | REAL | Grams per serving for each slot |

### `calibration`

| Column | Type | Notes |
|--------|------|-------|
| `slot` | INTEGER PK | 1–8 |
| `spice_name` | TEXT | |
| `cal_factor` | REAL | HX711 counts per gram |

---

## WiFi Provisioning

Flash the Arduino, then run:

```bash
python provision.py
```

The script auto-detects the serial port and your current WiFi network (Windows/macOS), sends credentials over Serial, and confirms `PROV:OK`.

Manual override:

```bash
python provision.py --port COM3 --ssid MyNetwork --password secret
```

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
