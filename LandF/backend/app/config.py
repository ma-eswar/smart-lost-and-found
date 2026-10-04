import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR.parent / "uploads"
DB_DIR = BASE_DIR / "data"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DB_DIR.mkdir(parents=True, exist_ok=True)

ADMIN_PIN = os.getenv("ADMIN_PIN", "admin123")
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-aegis-lost-and-found-key-2026")
ALGORITHM = "HS256"
APP_PORT = int(os.getenv("PORT", 8000))
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
