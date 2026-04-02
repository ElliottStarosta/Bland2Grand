# Bland2Grand -- Backend

Flask + SQLite backend for the Bland2Grand smart spice dispenser.

## Setup

```bash
# 1. Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure your API key
#    Open .env and replace the placeholder with your real OpenRouter key
nano .env
```

## .env file

```
OPENROUTER_API_KEY=your_openrouter_api_key_here
AI_MODEL=deepseek/deepseek-r1-0528:free
FLASK_PORT=5000
FLASK_DEBUG=false
ARDUINO_HOST=simulate        # change to Arduino IP when hardware is ready
ARDUINO_PORT=8080
```

Set `ARDUINO_HOST=simulate` to run without hardware. The dispenser will
simulate motor responses with fake progress events so the full frontend
flow works on a laptop.

## Run

```bash
python app.py
```

Server starts at `http://0.0.0.0:5000`. The SQLite database
`bland2grand.db` is created automatically with 200+ pre-loaded recipes
on first run.

## API Endpoints

| Method | Endpoint                  | Description                              |
|--------|---------------------------|------------------------------------------|
| GET    | /api/search?q=taco        | Search recipes, AI fallback if no match  |
| GET    | /api/recipe/<id>          | Get single recipe by ID                  |
| POST   | /api/dispense             | Start dispense sequence                  |
| GET    | /api/dispense/stream      | SSE stream for live progress             |
| GET    | /api/dispense/status      | Polling fallback for SSE                 |
| POST   | /api/recipe/custom        | Save a custom user recipe                |
| POST   | /api/calibrate            | Update grams-per-revolution calibration  |
| GET    | /api/calibrate            | Get current calibration values           |
| GET    | /api/spices               | List 8 spice slots and motor assignments |
| GET    | /api/stats                | Usage statistics                         |

## File Structure

```
bland2grand/
  app.py           -- Flask application and all route handlers
  database.py      -- SQLite schema, 200+ seed recipes, DB helpers
  search.py        -- FTS + LIKE + token overlap search and ranking
  ai_client.py     -- OpenRouter API client with validation and retry
  dispenser.py     -- Arduino TCP communication and SSE event streaming
  .env             -- API keys and config (never commit this)
  requirements.txt -- Python dependencies
  bland2grand.db   -- SQLite database (auto-created on first run)
  calibration.json -- Per-spice grams-per-revolution (auto-created)
```

## Search Algorithm

Queries run three strategies in order:

1. **FTS5** -- SQLite full-text search with BM25 ranking and prefix matching
2. **LIKE fallback** -- Substring match for short or partial queries
3. **Token overlap** -- Jaccard similarity between query tokens and recipe name

Results are ranked by a composite score:

```
score = fts_rank      * 0.50
      + token_overlap * 0.30
      + popularity    * 0.10
      + source_trust  * 0.10
```

AI-generated recipes score slightly lower (source_trust = 0.7) until
they accumulate use count, preventing unproven AI results from
displacing established recipes.

## AI Fallback

When no local recipe matches a query, the backend calls the OpenRouter
API with a structured prompt constraining the AI to only return gram
amounts for the 8 available spices. The response is validated:

- All keys must be valid spice names
- Each value clamped to 0.0 -- 8.0 g per serving
- At least 2 spices must be non-zero
- Total grams must be between 1.0 and 30.0 g
- If total exceeds 30g, all values are scaled down proportionally

The validated recipe is saved to the database immediately so the AI
is never called twice for the same dish.

## Dispense Sequence

For each spice in the plan, the dispenser:

1. Sends `{ "motor": N, "grams": X }` to the Arduino over TCP
2. Streams intermediate `progress` events to the SSE queue
3. Waits for `{ "status": "done", "actual": Y }` confirmation
4. Emits `spice_done` event with actual vs target comparison
5. Logs the complete dispense to `dispense_log` table
