"""
ai_client.py
------------
Handles all communication with the OpenRouter API (DeepSeek model).

Responsibilities
----------------
1. Build a structured prompt that constrains the AI to only return
   gram amounts for the 8 available spices.
2. Call the OpenRouter /chat/completions endpoint with retry logic.
3. Parse and VALIDATE the JSON response:
     - All returned spice keys must be in SPICES
     - Each gram value must be a non-negative float
     - Each gram value must be <= MAX_GRAMS_PER_SERVING (sanity cap)
     - Total grams across all spices must be between MIN_TOTAL and MAX_TOTAL
     - At least MIN_SPICES spices must have a non-zero amount
4. Decide the cuisine_tag from the AI response or infer it from keywords.
5. Return a validated dict ready for database insertion.

If the AI fails (network error, bad JSON, failed validation) after
MAX_RETRIES attempts, raise AiError so the caller can handle.
"""

import os
import re
import json
import time
import requests
from typing import Dict, Any
from dotenv import load_dotenv
from database import SPICES

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
AI_MODEL           = os.getenv("AI_MODEL", "deepseek/deepseek-r1-0528:free")
API_URL            = "https://openrouter.ai/api/v1/chat/completions"

# Validation constants
MAX_GRAMS_PER_SERVING = 8.0   # no single spice should exceed 8g/serving
MIN_TOTAL_GRAMS       = 0.5   # a blend must have at least 0.5g total
MAX_TOTAL_GRAMS       = 50.0  # a single-serve blend over 50g is unrealistic
MIN_SPICES            = 2     # at least 2 spices must be non-zero
MAX_RETRIES           = 3
RETRY_DELAY_SECONDS   = 2

# Human-readable spice names for the prompt
SPICE_DISPLAY = {
    "cumin":         "Cumin",
    "paprika":       "Paprika",
    "garlic_powder": "Garlic Powder",
    "chili_powder":  "Chili Powder",
    "oregano":       "Oregano",
    "onion_powder":  "Onion Powder",
    "black_pepper":  "Black Pepper",
    "cayenne":       "Cayenne Pepper",
}

CUISINE_KEYWORDS = {
    "mexican":    ["taco", "enchilada", "burrito", "salsa", "mole", "quesadilla",
                   "fajita", "tamale", "carnitas", "pozole", "birria", "chile"],
    "indian":     ["curry", "masala", "tikka", "biryani", "dal", "paneer",
                   "tandoori", "korma", "vindaloo", "chana", "aloo", "samosa"],
    "italian":    ["pasta", "pizza", "risotto", "ossobuco", "bolognese",
                   "arrabbiata", "bruschetta", "focaccia", "meatball"],
    "bbq":        ["bbq", "brisket", "ribs", "smoked", "pulled pork", "rub",
                   "grill", "barbecue"],
    "cajun":      ["cajun", "creole", "jambalaya", "gumbo", "etouffee",
                   "blackened", "louisiana"],
    "middleeast": ["shawarma", "kebab", "kofta", "falafel", "hummus",
                   "tagine", "za'atar", "baharat", "moroccan"],
    "asian":      ["stir fry", "teriyaki", "korean", "thai", "japanese",
                   "chinese", "pad thai", "bulgogi", "rendang"],
    "greek":      ["greek", "souvlaki", "gyro", "moussaka", "spanakopita"],
    "african":    ["moroccan", "berbere", "suya", "jerk", "harissa"],
    "latin":      ["peruvian", "brazilian", "colombian", "cuban", "puerto rico",
                   "chimichurri", "sazon"],
    "seafood":    ["shrimp", "salmon", "fish", "crab", "lobster", "scallop",
                   "cod", "halibut", "tuna", "calamari"],
    "vegan":      ["tofu", "tempeh", "lentil", "chickpea", "cauliflower",
                   "eggplant", "mushroom", "vegetable"],
}


class AiError(Exception):
    """Raised when the AI client cannot produce a valid recipe."""
    pass


def _infer_cuisine(dish_name: str) -> str:
    """Keyword-based cuisine tag inference as a fallback."""
    lower = dish_name.lower()
    best_tag = "general"
    best_count = 0
    for tag, keywords in CUISINE_KEYWORDS.items():
        count = sum(1 for kw in keywords if kw in lower)
        if count > best_count:
            best_count = count
            best_tag = tag
    return best_tag


def _build_prompt(dish_name: str) -> str:
    spice_list = "\n".join(
        f"  - {SPICE_DISPLAY[s]} (key: \"{s}\")" for s in SPICES
    )
    return f"""You are a professional chef and spice specialist.

A user wants to season the dish: "{dish_name}"

You have EXACTLY these 8 spices available in a dispenser:
{spice_list}

Task: Return a JSON object with the ideal spice blend for this dish.

Rules:
1. Only use the exact key names listed above (e.g. "cumin", "garlic_powder").
2. Values are gram amounts PER SINGLE SERVING (a typical serving is 150-250g of food).
3. Values must be numbers between 0 and {MAX_GRAMS_PER_SERVING}.
4. Omit any spice that is genuinely NOT appropriate for this dish (or set it to 0).
5. Use at least {MIN_SPICES} spices.
6. Also include:
   - "name": a short descriptive blend name (max 40 chars)
   - "description": one sentence about the flavour profile (max 80 chars)
   - "cuisine_tag": one of: mexican, indian, italian, bbq, cajun, middleeast,
                   asian, greek, african, latin, seafood, vegan, american, general

Return ONLY a valid JSON object. No markdown fences, no explanation.

Example format:
{{
  "name": "Classic Taco Seasoning",
  "description": "Bold and earthy with a gentle heat",
  "cuisine_tag": "mexican",
  "cumin": 2.5,
  "paprika": 1.5,
  "garlic_powder": 1.0,
  "chili_powder": 2.0,
  "oregano": 0.5,
  "onion_powder": 1.0,
  "black_pepper": 0.3,
  "cayenne": 0.4
}}"""


def _call_api(prompt: str) -> str:
    """Call OpenRouter API. Returns raw response text."""
    print(f"[AI] Calling OpenRouter API with prompt for dish '{prompt}...'")
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5000",
        "X-Title": "Bland2Grand Spice Dispenser",
    }
    payload = {
        "model": AI_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,   # low temp = consistent, reproducible blends
        "max_tokens": 400,
    }
    resp = requests.post(API_URL, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"]


def _extract_json(text: str) -> dict:
    """
    Extract a JSON object from the AI response text.
    Handles accidental markdown fences and leading/trailing text.
    """
    # Strip markdown code fences if present
    text = re.sub(r"```(?:json)?", "", text).strip()

    # Find the first { ... } block
    start = text.find("{")
    end   = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in response")

    return json.loads(text[start:end + 1])


def _validate(data: dict, dish_name: str) -> dict:
    """
    Validate and clean the parsed JSON from the AI.
    Returns a normalised dict ready for database insertion.
    Raises ValueError with a descriptive message on failure.
    """
    # Required metadata fields
    name        = str(data.get("name", "")).strip()
    description = str(data.get("description", "")).strip()
    cuisine_tag = str(data.get("cuisine_tag", "")).strip().lower()

    if not name:
        name = f"{dish_name.title()} Blend"
    if not description:
        description = f"AI-generated blend for {dish_name}"
    if cuisine_tag not in CUISINE_KEYWORDS and cuisine_tag != "general":
        cuisine_tag = _infer_cuisine(dish_name)

    # Validate and clamp spice values
    spice_grams = {}
    total = 0.0
    non_zero = 0

    for spice in SPICES:
        raw = data.get(spice, 0)
        try:
            val = float(raw)
        except (TypeError, ValueError):
            val = 0.0

        # Clamp negatives to 0, cap at MAX_GRAMS_PER_SERVING
        val = max(0.0, min(val, MAX_GRAMS_PER_SERVING))
        # Round to 1 decimal for clean database storage
        val = round(val, 1)

        spice_grams[spice] = val
        total += val
        if val > 0:
            non_zero += 1

    if non_zero < MIN_SPICES:
        raise ValueError(
            f"AI returned only {non_zero} non-zero spices, minimum is {MIN_SPICES}"
        )
    if total < MIN_TOTAL_GRAMS:
        raise ValueError(
            f"Total grams ({total:.1f}) below minimum ({MIN_TOTAL_GRAMS})"
        )
    if total > MAX_TOTAL_GRAMS:
        # Scale down proportionally rather than rejecting outright
        factor = MAX_TOTAL_GRAMS / total
        spice_grams = {k: round(v * factor, 1) for k, v in spice_grams.items()}

    return {
        "name":        name,
        "description": description,
        "cuisine_tag": cuisine_tag,
        "spice_grams": spice_grams,
    }


def get_ai_recipe(dish_name: str) -> dict:
    """
    Main public function. Returns a validated recipe dict:
    {
        "name":        str,
        "description": str,
        "cuisine_tag": str,
        "spice_grams": { spice_key: float, ... }
    }
    Raises AiError if all retries fail.
    """
    if not OPENROUTER_API_KEY:
        raise AiError("OPENROUTER_API_KEY is not configured in .env")

    prompt = _build_prompt(dish_name)
    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            raw_text = _call_api(prompt)
            parsed   = _extract_json(raw_text)
            result   = _validate(parsed, dish_name)
            print(f"[AI] Recipe generated for '{dish_name}' "
                  f"on attempt {attempt}: {result['name']}")
            return result

        except requests.exceptions.RequestException as e:
            last_error = f"Network error: {e}"
            print(f"[AI] Attempt {attempt} network error: {e}")
        except (json.JSONDecodeError, ValueError) as e:
            last_error = f"Parse/validation error: {e}"
            print(f"[AI] Attempt {attempt} parse error: {e}")
        except Exception as e:
            last_error = f"Unexpected error: {e}"
            print(f"[AI] Attempt {attempt} unexpected error: {e}")

        if attempt < MAX_RETRIES:
            time.sleep(RETRY_DELAY_SECONDS * attempt)

    raise AiError(f"AI recipe generation failed after {MAX_RETRIES} attempts. "
                  f"Last error: {last_error}")
