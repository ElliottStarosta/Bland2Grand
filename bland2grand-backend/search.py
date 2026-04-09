from database import search_recipes, save_recipe
from ai_client import get_blend_for_dish
from config import OPENROUTER_API_KEY


def find_recipes(query: str) -> list[dict]:
    """
    Returns up to 3 recipe matches.
    If none found locally, attempts AI generation (save-on-first-use).
    """
    query = query.strip()
    if not query:
        return []

    results = search_recipes(query, limit=3)
    if results:
        return results

    # AI fallback
    if not OPENROUTER_API_KEY:
        return []

    try:
        blend = get_blend_for_dish(query)
        # Save to DB so subsequent lookups are instant
        recipe_id = save_recipe(
            name=query.title(),
            spices=blend,
            category="AI Generated",
            description=f"AI-generated blend for {query.title()}",
        )
        from database import get_recipe_by_id
        new_recipe = get_recipe_by_id(recipe_id)
        return [new_recipe] if new_recipe else []
    except Exception as exc:
        print(f"[Search] AI fallback failed: {exc}")
        return []