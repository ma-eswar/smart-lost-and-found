from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import os

from app.database import init_db
from app.config import UPLOAD_DIR
from app.services.storage import save_upload_file
from app.routers import (
    auth,
    lost_items,
    found_items,
    desks,
    user_status,
    verification,
    admin,
    matching
)

app = FastAPI(
    title="SafeRecover | Smart Lost & Found Platform",
    description="Production-grade Double-Blind Smart Lost & Found Platform with 5-Stage Matching, Autonomous Blind Verification Probes, Escrow, and Physical Handover OTP",
    version="2.0.0"
)

# Initialize database tables and default desks
init_db()

# Configure CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Uploads directory
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Include Routers
app.include_router(auth.router)
app.include_router(lost_items.router)
app.include_router(found_items.router)
app.include_router(desks.router)
app.include_router(user_status.router)
app.include_router(verification.router)
app.include_router(admin.router)
app.include_router(matching.router)

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        url = save_upload_file(file)
        return {"success": True, "url": url, "filename": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")

@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "system": "SafeRecover Smart Lost & Found Platform",
        "version": "2.0.0",
        "double_blind_protection": "ACTIVE"
    }

# Mount frontend static directory (dist if built, otherwise frontend root)
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"
DIST_DIR = FRONTEND_DIR / "dist"
if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="frontend-dist")
elif FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
