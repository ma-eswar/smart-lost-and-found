import os
import re
import uuid
import base64
from pathlib import Path
from fastapi import UploadFile, HTTPException
from app.config import UPLOAD_DIR, ALLOWED_EXTENSIONS

def save_upload_file(file: UploadFile) -> str:
    ext = Path(file.filename or "file.jpg").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        ext = ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    destination = UPLOAD_DIR / filename
    
    with open(destination, "wb") as buffer:
        buffer.write(file.file.read())
        
    return f"/uploads/{filename}"

def save_base64_image(data_url: str) -> str:
    """Save base64 data URL to an image file."""
    if not data_url or not data_url.startswith("data:"):
        return data_url  # Return original if already a path or URL
        
    try:
        header, encoded = data_url.split(",", 1)
        ext = ".jpg"
        if "image/png" in header:
            ext = ".png"
        # Clean and auto-pad base64 string
        clean_encoded = re.sub(r'[^A-Za-z0-9+/=]', '', encoded)
        missing_padding = len(clean_encoded) % 4
        if missing_padding:
            clean_encoded += "=" * (4 - missing_padding)
            
        data = base64.b64decode(clean_encoded)
        filename = f"{uuid.uuid4().hex}{ext}"
        destination = UPLOAD_DIR / filename
        
        with open(destination, "wb") as f:
            f.write(data)
            
        return f"/uploads/{filename}"
    except Exception as e:
        print(f"Error saving base64 image: {e}")
        return data_url
