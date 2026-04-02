"""
search.py
---------
All search and ranking logic for Bland2Grand.

Three search strategies run in order of preference:

1. FTS (Full-Text Search)
   SQLite fts5 tokenises the query and matches against recipe name,
   description, and cuisine_tag. Fast and handles multi-word queries.

2. LIKE fallback
   Case-insensitive substring match for short or partial queries
   not handled well by FTS.

3. Token overlap scoring
   Split both query and candidate name into tokens. Score = number of
   shared tokens / max(len(query_tokens), len(name_tokens)). Handles
   reversed word order ("chicken tikka" vs "tikka chicken").

After collecting raw candidates, a composite rank score is computed:

    score = fts_rank * 0.50
          + token_overlap * 0.30
          + popularity_boost * 0.10
          + freshness_penalty * 0.10

    popularity_boost = min(use_count / 100, 1.0)
    freshness_penalty= 0.5 if ai_generated else 1.0
      (AI recipes score slightly lower until proven popular)

The top N results are returned sorted by score descending.
"""

import sqlite3
import re
from typing import List, Dict, Any
from database import get_connection, SPICES


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def search_recipes(query: str, limit: int = 3) -> List[Dict[str, Any]]:
    """
    Main search entry point.
    Returns up to `limit` recipe dicts, sorted by composite score.
    """
    if not query or not query.strip():
        return []

    q = _normalise(query)
    candidates = _fts_search(q, limit * 4)

    if len(candidates) < limit:
        # Supplement with LIKE search
        like_results = _like_search(q, limit * 4)
        seen_ids = {r["id"] for r in candidates}
        for r in like_results:
            if r["id"] not in seen_ids:
                candidates.append(r)
                seen_ids.add(r["id"])

    if not candidates:
        return []

    scored = _rank(q, candidates)
    return scored[:limit]


def get_recipe_by_id(recipe_id: int) -> Dict[str, Any] | None:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM recipes WHERE id = ?", (recipe_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def recipe_to_dispense_plan(recipe: Dict[str, Any],
                             servings: float) -> Dict[str, float]:
    """
    Given a recipe dict and a serving count, return a dict of
    { spice_name: grams } for every non-zero spice, scaled to servings.

    Amounts are rounded to 1 decimal place and filtered to >= 0.1 g
    (below that the scale cannot meaningfully distinguish from noise).
    """
    plan = {}
    for spice in SPICES:
        base_grams = recipe.get(spice, 0) or 0
        scaled = round(base_grams * servings, 1)
        if scaled >= 0.1:
            plan[spice] = scaled
    return plan


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _normalise(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return dict(row)


def _fts_search(query: str, limit: int) -> List[Dict[str, Any]]:
    """
    FTS5 search with BM25 rank.
    fts5 bm25() returns negative values -- more negative = better match.
    """
    conn = get_connection()
    # Build FTS query: each token becomes a prefix match for robustness
    tokens = query.split()
    fts_query = " ".join(f'"{t}"*' for t in tokens)
    try:
        rows = conn.execute("""
            SELECT r.*, bm25(recipes_fts) AS fts_score
            FROM recipes r
            JOIN recipes_fts ON recipes_fts.rowid = r.id
            WHERE recipes_fts MATCH ?
            ORDER BY fts_score
            LIMIT ?
        """, (fts_query, limit)).fetchall()
    except Exception:
        rows = []
    conn.close()
    results = []
    for row in rows:
        d = dict(row)
        # Normalise fts_score to 0-1 (BM25 is negative, clamp to [-20, 0])
        raw = float(d.get("fts_score", -20))
        d["_fts_rank"] = max(0.0, 1.0 - abs(raw) / 20.0)
        results.append(d)
    return results


def _like_search(query: str, limit: int) -> List[Dict[str, Any]]:
    """Substring LIKE search across name and description."""
    conn = get_connection()
    pattern = f"%{query}%"
    rows = conn.execute("""
        SELECT *, 0.0 AS fts_score
        FROM recipes
        WHERE lower(name) LIKE ?
           OR lower(description) LIKE ?
           OR lower(cuisine_tag) LIKE ?
        LIMIT ?
    """, (pattern, pattern, f"%{query.split()[0]}%", limit)).fetchall()
    conn.close()
    results = []
    for row in rows:
        d = dict(row)
        d["_fts_rank"] = 0.3  # LIKE results get a baseline FTS rank
        results.append(d)
    return results


def _token_overlap(query: str, name: str) -> float:
    """
    Jaccard-style token overlap between query and candidate name.
    Returns a value in [0, 1].
    """
    q_tokens = set(_normalise(query).split())
    n_tokens = set(_normalise(name).split())
    if not q_tokens or not n_tokens:
        return 0.0
    intersection = q_tokens & n_tokens
    union = q_tokens | n_tokens
    return len(intersection) / len(union)


def _rank(query: str, candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Compute composite score for each candidate and sort descending.

    score = fts_rank      * 0.50
          + token_overlap * 0.30
          + popularity    * 0.10
          + source_trust  * 0.10

    popularity = min(use_count / 50, 1.0)  -- saturates at 50 uses
    source_trust = 1.0 for hand-curated, 0.7 for AI-generated
    """
    for c in candidates:
        fts      = c.get("_fts_rank", 0.0)
        overlap  = _token_overlap(query, c.get("name", ""))
        pop      = min((c.get("use_count", 0) or 0) / 50.0, 1.0)
        trust    = 0.7 if c.get("ai_generated") else 1.0

        c["_score"] = (
            fts     * 0.50 +
            overlap * 0.30 +
            pop     * 0.10 +
            trust   * 0.10
        )

    candidates.sort(key=lambda x: x["_score"], reverse=True)

    # Strip internal scoring keys before returning
    clean = []
    for c in candidates:
        c.pop("_fts_rank", None)
        c.pop("_score", None)
        c.pop("fts_score", None)
        clean.append(c)
    return clean
