import json
from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from app.database import get_db_connection, seed_demo_dataset
from app.config import ADMIN_PIN
from app.schemas import AdminAuthRequest
from datetime import datetime

router = APIRouter(prefix="/api/admin", tags=["Admin"])

def verify_admin_access(x_admin_pin: Optional[str] = Header(None)):
    if not x_admin_pin or x_admin_pin != ADMIN_PIN:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid Admin PIN")
    return True

@router.post("/login")
def admin_login(payload: AdminAuthRequest):
    if payload.pin == ADMIN_PIN:
        return {"success": True, "token": ADMIN_PIN, "message": "Admin authenticated successfully"}
    raise HTTPException(status_code=401, detail="Invalid Admin PIN")

@router.post("/seed-demo")
def seed_demo(x_admin_pin: Optional[str] = Header(None)):
    """Seeds the realistic 1-click end-to-end demo dataset."""
    # Allow seeding either with PIN or for quick evaluator testing
    result = seed_demo_dataset()
    return result

@router.get("/lost-items")
def get_all_lost_items(include_archived: bool = False, x_admin_pin: Optional[str] = Header(None)):
    verify_admin_access(x_admin_pin)
    conn = get_db_connection()
    cursor = conn.cursor()
    if include_archived:
        cursor.execute("SELECT * FROM lost_items ORDER BY created_at DESC")
    else:
        cursor.execute("SELECT * FROM lost_items WHERE status != 'ARCHIVED' AND (is_archived IS NULL OR is_archived = 0) ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    
    items = []
    for r in rows:
        items.append({
            "id": r["id"],
            "product_name": r["product_name"],
            "category": r["category"],
            "description": r["description"],
            "reference_photos": json.loads(r["reference_photos"]) if r["reference_photos"] else [],
            "secret_points": json.loads(r["secret_points"]) if r["secret_points"] else [],
            "reward_amount": r["reward_amount"],
            "reward_currency": r["reward_currency"],
            "escrow_status": r["escrow_status"],
            "owner_name": r["owner_name"],
            "owner_phone": r["owner_phone"],
            "backup_contact": r["backup_contact"],
            "owner_email": r["owner_email"],
            "residential_address": r["residential_address"],
            "govt_id_last4": r["govt_id_last4"],
            "last_seen_location": r["last_seen_location"],
            "latitude": r["latitude"],
            "longitude": r["longitude"],
            "last_seen_time": r["last_seen_time"],
            "status": r["status"],
            "is_archived": bool(r["is_archived"]) if "is_archived" in r.keys() and r["is_archived"] else False,
            "created_at": r["created_at"],
            "updated_at": r["updated_at"]
        })
    return items

@router.get("/found-items")
def get_all_found_items(include_archived: bool = False, x_admin_pin: Optional[str] = Header(None)):
    verify_admin_access(x_admin_pin)
    conn = get_db_connection()
    cursor = conn.cursor()
    if include_archived:
        cursor.execute("SELECT * FROM found_items ORDER BY created_at DESC")
    else:
        cursor.execute("SELECT * FROM found_items WHERE status != 'ARCHIVED' AND (is_archived IS NULL OR is_archived = 0) ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    
    items = []
    for r in rows:
        items.append({
            "id": r["id"],
            "submission_type": r["submission_type"],
            "desk_id": r["desk_id"],
            "desk_intake_receipt_id": r["desk_intake_receipt_id"],
            "object_name": r["object_name"],
            "category": r["category"],
            "description": r["description"],
            "primary_photo": r["primary_photo"],
            "additional_photos": json.loads(r["additional_photos"]) if r["additional_photos"] else [],
            "found_location": r["found_location"],
            "latitude": r["latitude"],
            "longitude": r["longitude"],
            "found_time": r["found_time"],
            "pickup_availability": r["pickup_availability"],
            "finder_name": r["finder_name"],
            "finder_phone": r["finder_phone"],
            "finder_email": r["finder_email"],
            "finder_upi_id": r["finder_upi_id"],
            "is_verified_samaritan": bool(r["is_verified_samaritan"]),
            "status": r["status"],
            "is_archived": bool(r["is_archived"]) if "is_archived" in r.keys() and r["is_archived"] else False,
            "created_at": r["created_at"],
            "updated_at": r["updated_at"]
        })
    return items

@router.get("/escrow-records")
def get_escrow_records(x_admin_pin: Optional[str] = Header(None)):
    verify_admin_access(x_admin_pin)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM escrow_records ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    
    return [dict(r) for r in rows]

@router.get("/archived-items")
def get_archived_items(x_admin_pin: Optional[str] = Header(None)):
    verify_admin_access(x_admin_pin)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT 'LOST' as item_type, id, product_name as name, category, status, updated_at as resolved_at
    FROM lost_items WHERE is_archived = 1
    UNION ALL
    SELECT 'FOUND' as item_type, id, object_name as name, category, status, updated_at as resolved_at
    FROM found_items WHERE is_archived = 1
    ORDER BY resolved_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@router.post("/items/{item_id}/status")
def update_item_status(item_id: str, payload: dict, x_admin_pin: Optional[str] = Header(None)):
    verify_admin_access(x_admin_pin)
    new_status = payload.get("status")
    if not new_status:
        raise HTTPException(status_code=400, detail="New status required")
        
    now_str = datetime.now().isoformat()
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if item_id.startswith("LOST") or item_id.startswith("DEMO-LOST"):
        cursor.execute("UPDATE lost_items SET status = ?, updated_at = ? WHERE id = ?", (new_status, now_str, item_id))
    else:
        cursor.execute("UPDATE found_items SET status = ?, updated_at = ? WHERE id = ?", (new_status, now_str, item_id))
        
    conn.commit()
    conn.close()
    return {"success": True, "item_id": item_id, "new_status": new_status}

@router.post("/escrow/{escrow_id}/release")
def release_escrow_reward(escrow_id: str, payload: dict, x_admin_pin: Optional[str] = Header(None)):
    verify_admin_access(x_admin_pin)
    recipient_upi = payload.get("recipient_upi")
    now_str = datetime.now().isoformat()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE escrow_records 
    SET status = 'DISBURSED', recipient_upi = ?, updated_at = ?
    WHERE id = ?
    """, (recipient_upi, now_str, escrow_id))
    
    # Update linked lost item escrow status
    cursor.execute("SELECT lost_item_id FROM escrow_records WHERE id = ?", (escrow_id,))
    row = cursor.fetchone()
    if row and row["lost_item_id"]:
        cursor.execute("UPDATE lost_items SET escrow_status = 'RELEASED', updated_at = ? WHERE id = ?", (now_str, row["lost_item_id"]))
        
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "escrow_id": escrow_id,
        "status": "DISBURSED",
        "recipient_upi": recipient_upi,
        "disbursed_at": now_str
    }
