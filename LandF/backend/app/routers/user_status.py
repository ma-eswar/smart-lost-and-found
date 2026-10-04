import json
from fastapi import APIRouter, HTTPException
from app.database import get_db_connection
from app.schemas import StatusLookupRequest

router = APIRouter(prefix="/api/user-status", tags=["User Status"])

@router.post("/lookup")
def lookup_user_submissions(payload: StatusLookupRequest):
    query = payload.phone_or_token.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Please provide a phone number, tracking token, or ID")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Search lost items matching phone OR access_token OR id OR user_id
    cursor.execute("""
    SELECT * FROM lost_items 
    WHERE owner_phone = ? OR access_token = ? OR id = ? OR user_id = ?
    ORDER BY created_at DESC
    """, (query, query, query, query))
    lost_rows = cursor.fetchall()
    
    # 2. Search found items matching phone OR access_token OR id OR receipt_id OR user_id
    cursor.execute("""
    SELECT * FROM found_items 
    WHERE finder_phone = ? OR access_token = ? OR id = ? OR desk_intake_receipt_id = ? OR user_id = ?
    ORDER BY created_at DESC
    """, (query, query, query, query, query))
    found_rows = cursor.fetchall()
    
    formatted_lost = []
    for row in lost_rows:
        # Check if match evaluation has authorized passcode
        cursor.execute("""
        SELECT passcode, is_used, expires_at 
        FROM release_authorizations 
        WHERE lost_item_id = ? AND is_used = 0
        ORDER BY created_at DESC LIMIT 1
        """, (row["id"],))
        auth_row = cursor.fetchone()
        active_passcode = auth_row["passcode"] if auth_row else None

        formatted_lost.append({
            "id": row["id"],
            "product_name": row["product_name"],
            "category": row["category"],
            "description": row["description"],
            "reference_photos": json.loads(row["reference_photos"]) if row["reference_photos"] else [],
            "reward_amount": row["reward_amount"],
            "reward_currency": row["reward_currency"],
            "escrow_status": row["escrow_status"],
            "owner_name": row["owner_name"],
            "owner_phone": row["owner_phone"],
            "backup_contact": row["backup_contact"],
            "owner_email": row["owner_email"],
            "residential_address": row["residential_address"],
            "govt_id_last4": row["govt_id_last4"],
            "last_seen_location": row["last_seen_location"],
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "last_seen_time": row["last_seen_time"],
            "status": row["status"],
            "active_passcode": active_passcode,
            "secret_points_count": len(json.loads(row["secret_points"])) if row["secret_points"] else 0,
            "access_token": row["access_token"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"]
        })
        
    formatted_found = []
    for row in found_rows:
        # Query any verification probes for this found item
        cursor.execute("""
        SELECT id, found_item_id, target_area, neutral_prompt, finder_response_photo,
               probe_status, created_at
        FROM verification_probes
        WHERE found_item_id = ?
        ORDER BY created_at DESC
        """, (row["id"],))
        probe_rows = cursor.fetchall()

        formatted_found.append({
            "id": row["id"],
            "submission_type": row["submission_type"],
            "desk_id": row["desk_id"],
            "desk_intake_receipt_id": row["desk_intake_receipt_id"],
            "object_name": row["object_name"],
            "category": row["category"],
            "description": row["description"],
            "primary_photo": row["primary_photo"],
            "additional_photos": json.loads(row["additional_photos"]) if row["additional_photos"] else [],
            "found_location": row["found_location"],
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "found_time": row["found_time"],
            "pickup_availability": row["pickup_availability"],
            "finder_name": row["finder_name"],
            "finder_phone": row["finder_phone"],
            "finder_email": row["finder_email"],
            "finder_upi_id": row["finder_upi_id"],
            "is_verified_samaritan": bool(row["is_verified_samaritan"]),
            "status": row["status"],
            "access_token": row["access_token"],
            "pending_probes": [dict(p) for p in probe_rows],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"]
        })
        
    conn.close()

    if not formatted_lost and not formatted_found:
        raise HTTPException(status_code=404, detail="No active or past submissions found for the provided query")
        
    return {
        "success": True,
        "query": query,
        "lost_items": formatted_lost,
        "found_items": formatted_found
    }
