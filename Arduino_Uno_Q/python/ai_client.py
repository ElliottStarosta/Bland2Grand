import json
import re
import requests
from config import OPENROUTER_API_KEY, AI_MODEL, API_URL
from slot_config import SPICE_SLOTS

# System prompt that guides the AI to respond with JSON only
_SYSTEM = (
    "You are a professional culinary spice expert. "
    "Respond ONLY with a valid JSON object -- no markdown fences, no preamble. "
    "Values are grams of each spice per single serving."
)

def _build_template(dish: str) -> str:
    """Build the user prompt with available spice slots and formatting instructions."""
    slot_list = ", ".join(f"{k}={v}" for k, v in SPICE_SLOTS.items())

    return (
        f'Create a spice blend for "{dish}" using ONLY these slots:\n'
        f"{slot_list}\n\n"
        "Return ONLY valid JSON.\n"
        "Keys must be strings \"1\" through \"8\".\n"
        "Values must be floats (grams per serving).\n"
        "If a spice is not used, set it to 0.\n"
        "No markdown. No explanation. JSON only."
    )


def _call_api(prompt: str) -> str:
    """Call OpenRouter API and return the raw response text."""
    print(f"[AI] Querying OpenRouter for: {prompt!r}")
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5000",
        "X-Title": "Bland2Grand Spice Dispenser",
    }
    payload = {
        "model": AI_MODEL,
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3  # Low temperature for consistent, deterministic output
    }
    resp = requests.post(API_URL, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _parse_blend(text: str) -> dict:
    """Extract a JSON blob from the model response and validate it."""
    # Strip potential markdown fences (code blocks)
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    # Grab the first JSON object block
    match = re.search(r"\{[^}]+\}", cleaned)
    if not match:
        raise ValueError(f"No JSON object found in AI response: {text!r}")
    blend = json.loads(match.group())
    # Ensure all 8 keys are present and values are non-negative floats
    validated = {}
    for slot in range(1, 9):
        val = float(blend.get(str(slot), 0))
        validated[str(slot)] = max(0.0, min(val, 10.0))  # Clamp to 0–10g per serving
    return validated


def get_blend_for_dish(dish_name: str) -> dict:
    """
    Returns a dict: {"1": grams, "2": grams, …} for slots 1-8.
    Raises on API or parse error.
    """
    prompt = _build_template(dish_name)
    print(f"[AI] Prompt:\n{prompt}")
    raw = _call_api(prompt)
    blend = _parse_blend(raw)
    print(f"[AI] Blend for '{dish_name}': {blend}")
    return blend