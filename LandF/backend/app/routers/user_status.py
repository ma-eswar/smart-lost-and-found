import json
from fastapi import APIRouter, HTTPException
from app.database import get_db_connection
from app.schemas import StatusLookupRequest
from app.security import normalize_phone

router = APIRouter(tags=["User Status & Notifications"])

# -------------------------------------------------------------
# 1. SUBMISSION LOOKUP
# -------------------------------------------------------------
@router.post("/api/user-status/lookup")
def lookup_user_submissions(payload: StatusLookupRequest):
    query = payload.phone_or_token.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Please provide a phone number, tracking token, or ID")
        
    norm_phone = normalize_phone(query)
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Search lost items matching phone OR normalized phone OR access_token OR id OR user_id
    cursor.execute("""
    SELECT * FROM lost_items 
    WHERE (owner_phone = ? OR owner_phone LIKE ? OR access_token = ? OR id = ? OR user_id = ?)
      AND status != 'ARCHIVED' AND (is_archived IS NULL OR is_archived = 0)
    ORDER BY created_at DESC
    """, (query, f"%{norm_phone}%" if norm_phone else query, query, query, query))
    lost_rows = cursor.fetchall()
    
    # Search found items matching phone OR normalized phone OR access_token OR id OR receipt_id OR user_id
    cursor.execute("""
    SELECT * FROM found_items 
    WHERE (finder_phone = ? OR finder_phone LIKE ? OR access_token = ? OR id = ? OR desk_intake_receipt_id = ? OR user_id = ?)
      AND status != 'ARCHIVED' AND (is_archived IS NULL OR is_archived = 0)
    ORDER BY created_at DESC
    """, (query, f"%{norm_phone}%" if norm_phone else query, query, query, query, query))
    found_rows = cursor.fetchall()
    
    formatted_lost = []
    for row in lost_rows:
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
        cursor.execute("""
        SELECT id, found_item_id, target_area, neutral_prompt, finder_response_photo, finder_notes,
               agent_verification_score, agent_analysis_reasoning, probe_status, created_at, updated_at
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

    return {
        "success": True,
        "query": query,
        "lost_items": formatted_lost,
        "found_items": formatted_found
    }


# -------------------------------------------------------------
# 2. IN-APP NOTIFICATIONS
# -------------------------------------------------------------
@router.get("/api/notifications/{user_identifier}")
def get_user_notifications(user_identifier: str):
    """
    Returns notifications for the given user_id or phone number.
    """
    ident = user_identifier.strip()
    if not ident:
        return []

    norm_phone = normalize_phone(ident)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT * FROM notifications 
    WHERE user_id = ? OR phone = ? OR phone LIKE ?
    ORDER BY created_at DESC LIMIT 30
    """, (ident, ident, f"%{norm_phone}%" if norm_phone else ident))
    rows = cursor.fetchall()
    conn.close()

    notifications = []
    for r in rows:
        notifications.append({
            "id": r["id"],
            "user_id": r["user_id"],
            "phone": r["phone"],
            "type": r["type"],
            "title": r["title"],
            "message": r["message"],
            "action_url": r["action_url"],
            "is_read": bool(r["is_read"]),
            "created_at": r["created_at"]
        })
    return notifications


@router.post("/api/notifications/{notification_id}/read")
def mark_notification_read(notification_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE notifications SET is_read = 1 WHERE id = ?", (notification_id,))
    conn.commit()
    conn.close()
    return {"success": True, "id": notification_id}


# -------------------------------------------------------------
# 3. FINANCIAL METRICS & USER METRICS
# -------------------------------------------------------------
@router.get("/api/users/{user_id}/metrics")
def get_user_financial_metrics(user_id: str):
    """
    Returns:
    - rewards_earned: sum of disbursed rewards for items found by this user.
    - money_spent: sum of escrow rewards released for their recovered lost items.
    - active_lost_count: currently active lost items.
    - active_found_count: currently active found items.
    """
    ident = user_id.strip()
    norm_phone = normalize_phone(ident)
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Rewards earned by this finder (where escrow is DISBURSED or RELEASED)
    cursor.execute("""
    SELECT COALESCE(SUM(e.amount), 0.0) as total_earned
    FROM escrow_records e
    JOIN found_items f ON e.found_item_id = f.id
    WHERE (f.user_id = ? OR f.finder_phone = ? OR f.finder_phone LIKE ?) AND e.status IN ('DISBURSED', 'RELEASED')
    """, (ident, ident, f"%{norm_phone}%" if norm_phone else ident))
    row_earned = cursor.fetchone()
    rewards_earned = float(row_earned["total_earned"]) if row_earned else 0.0

    # 2. Money spent by owner on recovered lost items (where escrow was DISBURSED/RELEASED)
    cursor.execute("""
    SELECT COALESCE(SUM(e.amount), 0.0) as total_spent
    FROM escrow_records e
    JOIN lost_items l ON e.lost_item_id = l.id
    WHERE (l.user_id = ? OR l.owner_phone = ? OR l.owner_phone LIKE ?) AND e.status IN ('DISBURSED', 'RELEASED')
    """, (ident, ident, f"%{norm_phone}%" if norm_phone else ident))
    row_spent = cursor.fetchone()
    money_spent = float(row_spent["total_spent"]) if row_spent else 0.0

    # 3. Active lost items count
    cursor.execute("""
    SELECT COUNT(*) as cnt FROM lost_items 
    WHERE (user_id = ? OR owner_phone = ? OR owner_phone LIKE ?) AND status NOT IN ('RESOLVED', 'ARCHIVED')
    """, (ident, ident, f"%{norm_phone}%" if norm_phone else ident))
    active_lost_count = cursor.fetchone()["cnt"]

    # 4. Active found items count
    cursor.execute("""
    SELECT COUNT(*) as cnt FROM found_items 
    WHERE (user_id = ? OR finder_phone = ? OR finder_phone LIKE ?) AND status NOT IN ('RESOLVED', 'ARCHIVED')
    """, (ident, ident, f"%{norm_phone}%" if norm_phone else ident))
    active_found_count = cursor.fetchone()["cnt"]

    conn.close()

    return {
        "user_id": ident,
        "rewards_earned": rewards_earned,
        "money_spent": money_spent,
        "active_lost_count": active_lost_count,
        "active_found_count": active_found_count
    }
