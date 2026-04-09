import sqlite3
from config import DATABASE_PATH, SPICE_SLOTS


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS recipes (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            name         TEXT    NOT NULL UNIQUE,
            category     TEXT    DEFAULT 'General',
            description  TEXT    DEFAULT '',
            s1_cumin          REAL DEFAULT 0,
            s2_paprika        REAL DEFAULT 0,
            s3_garlic_powder  REAL DEFAULT 0,
            s4_chili_powder   REAL DEFAULT 0,
            s5_oregano        REAL DEFAULT 0,
            s6_onion_powder   REAL DEFAULT 0,
            s7_black_pepper   REAL DEFAULT 0,
            s8_cayenne        REAL DEFAULT 0
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS calibration (
            slot       INTEGER PRIMARY KEY,
            spice_name TEXT,
            cal_factor REAL DEFAULT 1000.0
        )
    """)

    for slot, name in SPICE_SLOTS.items():
        cur.execute(
            "INSERT OR IGNORE INTO calibration (slot, spice_name, cal_factor) VALUES (?, ?, ?)",
            (slot, name, 1000.0),
        )

    conn.commit()
    conn.close()


# Column name helpers

_SLOT_TO_COL = {
    1: "s1_cumin",
    2: "s2_paprika",
    3: "s3_garlic_powder",
    4: "s4_chili_powder",
    5: "s5_oregano",
    6: "s6_onion_powder",
    7: "s7_black_pepper",
    8: "s8_cayenne",
}


def _recipe_to_dict(row: sqlite3.Row) -> dict:
    """Convert a DB row into the JSON-serialisable recipe format."""
    spices = []
    for slot, col in _SLOT_TO_COL.items():
        g = row[col]
        if g and g > 0:
            spices.append(
                {"slot": slot, "name": SPICE_SLOTS[slot], "grams_per_serving": round(g, 2)}
            )
    return {
        "id": row["id"],
        "name": row["name"],
        "category": row["category"] or "General",
        "description": row["description"] or "",
        "spices": spices,
    }


# Public API

def search_recipes(query: str, limit: int = 3) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM recipes WHERE name LIKE ? COLLATE NOCASE ORDER BY name LIMIT ?",
        (f"%{query}%", limit),
    ).fetchall()
    conn.close()
    return [_recipe_to_dict(r) for r in rows]


def get_recipe_by_id(recipe_id: int) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    conn.close()
    return _recipe_to_dict(row) if row else None


def get_recipe_by_name(name: str) -> dict | None:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM recipes WHERE name LIKE ? COLLATE NOCASE", (name,)
    ).fetchone()
    conn.close()
    return _recipe_to_dict(row) if row else None


def save_recipe(name: str, spices: dict, category: str = "AI Generated", description: str = "") -> int:
    """spices: {slot_str: grams, …}  e.g. {"1": 2.0, "2": 1.5, …}"""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """INSERT OR REPLACE INTO recipes
           (name, category, description,
            s1_cumin, s2_paprika, s3_garlic_powder, s4_chili_powder,
            s5_oregano, s6_onion_powder, s7_black_pepper, s8_cayenne)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            name, category, description,
            float(spices.get("1", 0)),
            float(spices.get("2", 0)),
            float(spices.get("3", 0)),
            float(spices.get("4", 0)),
            float(spices.get("5", 0)),
            float(spices.get("6", 0)),
            float(spices.get("7", 0)),
            float(spices.get("8", 0)),
        ),
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return new_id


def update_calibration(slot: int, cal_factor: float) -> None:
    conn = get_connection()
    conn.execute(
        "UPDATE calibration SET cal_factor = ? WHERE slot = ?", (cal_factor, slot)
    )
    conn.commit()
    conn.close()