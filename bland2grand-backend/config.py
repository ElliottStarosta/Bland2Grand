import os
from dotenv import load_dotenv

load_dotenv()

ARDUINO_URL = os.getenv("ARDUINO_URL", "http://192.168.1.100")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
AI_MODEL = os.getenv("AI_MODEL", "anthropic/claude-3-haiku")
DATABASE_PATH = os.getenv("DATABASE_PATH", "bland2grand.db")
FLASK_PORT = int(os.getenv("FLASK_PORT", 5000))
MOCK_ARDUINO = os.getenv("MOCK_ARDUINO", "true").lower() == "true"

API_URL = "https://openrouter.ai/api/v1/chat/completions"

SPICE_SLOTS = {
    1: "Cumin",
    2: "Paprika",
    3: "Garlic Powder",
    4: "Chili Powder",
    5: "Oregano",
    6: "Onion Powder",
    7: "Black Pepper",
    8: "Cayenne",
}