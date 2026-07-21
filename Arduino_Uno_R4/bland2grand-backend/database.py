"""SQLite recipes + per-slot calibration tables."""

import sqlite3
from config import DATABASE_PATH, SPICE_SLOTS
from slot_config import SLOT_COLUMNS


def get_connection() -> sqlite3.Connection:
    # Create a new SQLite connection using the global database path
    # Row factory allows dictionary-like access to columns
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """
    Initialize database schema:
    - Creates recipes table if it doesn't exist
    - Creates calibration table if it doesn't exist
    - Seeds default calibration rows for each spice slot
    """
    conn = get_connection()
    cur = conn.cursor()

    # Dynamically build recipe spice columns from SLOT_COLUMNS mapping
    slot_col_defs = ",\n            ".join(
        f"{col} REAL DEFAULT 0" for col in SLOT_COLUMNS.values()
    )

    # Recipes table stores base recipe metadata + per-slot gram values
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS recipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            category TEXT DEFAULT 'General',
            description TEXT DEFAULT '',
            {slot_col_defs}
        )
    """)

    # Calibration table stores per-slot calibration factors
    cur.execute("""
        CREATE TABLE IF NOT EXISTS calibration (
            slot INTEGER PRIMARY KEY,
            spice_name TEXT,
            cal_factor REAL DEFAULT 1000.0
        )
    """)

    # Seed calibration table with default spice slots if missing
    for slot, name in SPICE_SLOTS.items():
        cur.execute(
            """
            INSERT OR IGNORE INTO calibration (slot, spice_name, cal_factor)
            VALUES (?, ?, ?)
            """,
            (slot, name, 1000.0),
        )

    # Ensure schema is up to date with current SLOT_COLUMNS definition
    _ensure_recipe_columns(cur)

    conn.commit()
    conn.close()


def _ensure_recipe_columns(cur: sqlite3.Cursor) -> None:
    """
    Ensures all expected spice columns exist in the recipes table.
    Useful for migrating older databases.
    """
    existing_cols = {
        row[1] for row in cur.execute("PRAGMA table_info(recipes)").fetchall()
    }

    for col in SLOT_COLUMNS.values():
        if col not in existing_cols:
            print(f"[DB] Adding missing column: {col}")
            cur.execute(f"ALTER TABLE recipes ADD COLUMN {col} REAL DEFAULT 0")


def _recipe_to_dict(row: sqlite3.Row) -> dict:
    """
    Converts a raw SQLite row into a structured JSON-friendly recipe object.
    Also transforms flat column schema into a per-slot spice list.
    """
    spices = []

    for slot, col in SLOT_COLUMNS.items():
        try:
            g = row[col]
        except (IndexError, KeyError):
            g = 0

        # Only include non-zero spice amounts
        if g and g > 0:
            spices.append(
                {
                    "slot": slot,
                    "name": SPICE_SLOTS[slot],
                    "grams_per_serving": round(g, 2),
                }
            )

    return {
        "id": row["id"],
        "name": row["name"],
        "category": row["category"] or "General",
        "description": row["description"] or "",
        "spices": spices,
    }


def search_recipes(query: str, limit: int = 6) -> list[dict]:
    """
    Search recipes by case-insensitive substring match on name.
    Returns at most `limit` results.
    """
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT * FROM recipes
        WHERE name LIKE ? COLLATE NOCASE
        ORDER BY name
        LIMIT ?
        """,
        (f"%{query}%", limit),
    ).fetchall()
    conn.close()
    return [_recipe_to_dict(r) for r in rows]


def search_recipes_by_category(category: str, limit: int = 10) -> list[dict]:
    # Search recipes by category using partial match
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT * FROM recipes
        WHERE category LIKE ? COLLATE NOCASE
        ORDER BY name
        LIMIT ?
        """,
        (f"%{category}%", limit),
    ).fetchall()
    conn.close()
    return [_recipe_to_dict(r) for r in rows]


def get_recipe_by_id(recipe_id: int) -> dict | None:
    # Fetch a single recipe by primary key ID
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM recipes WHERE id = ?",
        (recipe_id,),
    ).fetchone()
    conn.close()
    return _recipe_to_dict(row) if row else None


def get_recipe_by_name(name: str) -> dict | None:
    # Fetch a single recipe by name (case-insensitive match)
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM recipes WHERE name LIKE ? COLLATE NOCASE",
        (name,),
    ).fetchone()
    conn.close()
    return _recipe_to_dict(row) if row else None


def save_recipe(
    name: str,
    spices: dict,
    category: str = "AI Generated",
    description: str = "",
) -> int:
    """
    Insert or replace a recipe.

    spices format:
    - dict keyed by slot id ("1".."8")
    - values are grams per serving
    """
    conn = get_connection()
    cur = conn.cursor()

    cols = list(SLOT_COLUMNS.values())

    # Build SQL dynamically based on current slot configuration
    col_list = ", ".join(["name", "category", "description"] + cols)
    placeholders = ", ".join(["?"] * (3 + len(cols)))

    # Map input spice dict into ordered slot values
    values = (
        name,
        category,
        description,
        *[float(spices.get(str(slot), 0)) for slot in SLOT_COLUMNS.keys()],
    )

    cur.execute(
        f"""
        INSERT OR REPLACE INTO recipes ({col_list})
        VALUES ({placeholders})
        """,
        values,
    )

    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return new_id


def update_calibration(slot: int, cal_factor: float) -> None:
    # Update calibration factor for a specific spice slot
    conn = get_connection()
    conn.execute(
        "UPDATE calibration SET cal_factor = ? WHERE slot = ?",
        (cal_factor, slot),
    )
    conn.commit()
    conn.close()
