import json
import re
import requests
from config import OPENROUTER_API_KEY, AI_MODEL, API_URL
from slot_config import SPICE_SLOTS

_SYSTEM = (
    "You are a professional culinary spice expert. "
    "Respond ONLY with a valid JSON object -- no markdown fences, no preamble. "
    "Values are grams of each spice per single serving."
)

def _build_template() -> str:
    slot_list = ", ".join(f"{k}={v.replace(' ', '')}" for k, v in SPICE_SLOTS.items())
    keys = ", ".join(f'"{k}": g' for k in SPICE_SLOTS)
    return (
        'Give me a spice blend for "{dish}" using only these 8 slots: '
        f"{slot_list}. "
        f'Return ONLY valid JSON in the form {{{keys}}} '
        "where g is a float (0 if the spice is not used). "
        "Use realistic and authentic amounts. Max 10g per slot per serving."
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
        "temperature": 0.3
    }
    resp = requests.post(API_URL, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _parse_blend(text: str) -> dict:
    """Extract a JSON blob from the model response and validate it."""
    # Strip potential markdown fences
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    # Grab the first {...} block
    match = re.search(r"\{[^}]+\}", cleaned)
    if not match:
        raise ValueError(f"No JSON object found in AI response: {text!r}")
    blend = json.loads(match.group())
    # Ensure all 8 keys present and values are non-negative floats
    validated = {}
    for slot in range(1, 9):
        val = float(blend.get(str(slot), 0))
        validated[str(slot)] = max(0.0, min(val, 10.0))  # clamp 0–10 g
    return validated


def get_blend_for_dish(dish_name: str) -> dict:
    """
    Returns a dict: {"1": grams, "2": grams, …} for slots 1-8.
    Raises on API or parse error.
    """
    prompt = _build_template().format(dish=dish_name)
    raw = _call_api(prompt)
    blend = _parse_blend(raw)
    print(f"[AI] Blend for '{dish_name}': {blend}")
    return blend