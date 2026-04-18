from database import search_recipes, search_recipes_by_category, save_recipe, get_recipe_by_id
from ai_client import get_blend_for_dish
from config import OPENROUTER_API_KEY

# Known category keywords — if the query matches one, search by category instead
CATEGORY_ALIASES = {
    "mexican":        "Mexican",
    "indian":         "Indian",
    "italian":        "Italian",
    "bbq":            "BBQ",
    "cajun":          "Cajun",
    "mediterranean":  "Mediterranean",
    "middle eastern": "Middle Eastern",
    "vegetarian":     "Vegetarian",
    "vegan":          "Vegetarian",
    "seafood":        "Seafood",
    "breakfast":      "Breakfast",
    "asian":          "Asian",
    "caribbean":      "Caribbean",
    "latin":          "Latin",
    "moroccan":       "Moroccan",
    "turkish":        "Turkish",
    "levantine":      "Levantine",
    "north african":  "North African",
    "british":        "British",
    "american":       "American",
    "holiday":        "Holiday",
}


def find_recipes(query: str) -> list[dict]:
    """
    Returns up to 6 recipe matches.
    - If the query matches a known cuisine category, returns all recipes in that category.
    - Otherwise searches by name, then falls back to AI generation.
    """
    query = query.strip()
    if not query:
        return []

    # Check if query is a cuisine category
    normalised = query.lower()
    if normalised in CATEGORY_ALIASES:
        category = CATEGORY_ALIASES[normalised]
        results = search_recipes_by_category(category, limit=10)
        if results:
            return results

    # Standard name search
    results = search_recipes(query, limit=6)
    if results:
        return results

    # AI fallback — only for non-category queries
    if normalised in CATEGORY_ALIASES:
        return []

    if not OPENROUTER_API_KEY:
        print("[Search] No local results and OpenRouter API key not set, skipping AI fallback.")
        return []

    try:
        blend = get_blend_for_dish(query)
        recipe_id = save_recipe(
            name=query.title(),
            spices=blend,
            category="AI Generated",
            description=f"AI-generated blend for {query.title()}",
        )
        new_recipe = get_recipe_by_id(recipe_id)
        return [new_recipe] if new_recipe else []
    except Exception as exc:
        print(f"[Search] AI fallback failed: {exc}")
        return []