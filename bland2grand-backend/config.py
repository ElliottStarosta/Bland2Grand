"""Load config from .env -- Arduino URL, API keys, mock flag, etc."""

import os
from dotenv import load_dotenv
from slot_config import SPICE_SLOTS, SPICE_DENSITY_G_PER_ML, SPICE_COLORS

load_dotenv()

# Hardware
ARDUINO_URL = os.getenv("ARDUINO_URL", "http://192.168.1.100")

# AI recipe fallback (OpenRouter)
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
AI_MODEL = os.getenv("AI_MODEL", "anthropic/claude-3-haiku")
API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Server
DATABASE_PATH = os.getenv("DATABASE_PATH", "bland2grand.db")
FLASK_PORT = int(os.getenv("FLASK_PORT", 5000))
MOCK_ARDUINO = os.getenv("MOCK_ARDUINO", "true").lower() == "true"