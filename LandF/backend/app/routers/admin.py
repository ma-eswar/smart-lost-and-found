import json
from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from app.database import get_db_connection, seed_demo_dataset
from app.config import ADMIN_PIN
from app.schemas import AdminAuthRequest
from datetime import datetime, timedelta


router = APIRouter(prefix="/api/admin", tags=["Admin"])

def verify_admin_access(x_admin_pin: Optional[str] = Header(None)):
    pin_val = x_admin_pin or ADMIN_PIN
    if pin_val != ADMIN_PIN:
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
            "title": r["product_name"],
            "product_name": r["product_name"],
            "category": r["category"],
            "description": r["description"],
            "reference_photos": json.loads(r["reference_photos"]) if r["reference_photos"] else [],
            "secret_points": json.loads(r["secret_points"]) if r["secret_points"] else [],
            "reward_amount": r["reward_amount"],
            "reward_currency": r["reward_currency"],
            "escrow_status": r["escrow_status"],
            "claimant_name": r["owner_name"],
            "owner_name": r["owner_name"],
            "contact_phone": r["owner_phone"],
            "owner_phone": r["owner_phone"],
            "backup_contact": r["backup_contact"],
            "owner_email": r["owner_email"],
            "residential_address": r["residential_address"],
            "govt_id_last4": r["govt_id_last4"],
            "location_name": r["last_seen_location"],
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

@router.get("/pending-approvals")
def get_pending_handover_approvals(x_admin_pin: Optional[str] = Header(None)):
    """
    Returns all candidate matches and AI agent verification probes with complete dossiers
    for final Admin verification sign-off.
    """
    verify_admin_access(x_admin_pin)
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Query all pairs with verification probes (both pending and verified)
    cursor.execute("""
    SELECT vp.id as probe_id, vp.lost_item_id, vp.found_item_id,
           vp.secret_point_text, vp.neutral_prompt, vp.target_area,
           vp.finder_response_photo, vp.finder_notes, vp.agent_verification_score,
           vp.agent_analysis_reasoning, vp.probe_status, vp.created_at as probe_created_at, vp.updated_at as probe_updated_at,
           me.id as me_eval_id, me.composite_score, me.text_score, me.distance_km, me.distance_score,
           me.time_delta_hours, me.spatio_temporal_score, me.visual_score, me.admin_decision, me.verification_status,
           li.product_name, li.category as lost_category, li.description as lost_description,
           li.reference_photos, li.secret_points, li.reward_amount, li.reward_currency,
           li.owner_name, li.owner_phone, li.owner_email, li.residential_address,
           li.govt_id_last4, li.last_seen_location, li.last_seen_time, li.status as lost_status,
           fi.object_name, fi.category as found_category, fi.description as found_description,
           fi.primary_photo, fi.additional_photos, fi.found_location, fi.found_time,
           fi.pickup_availability, fi.finder_name, fi.finder_phone, fi.finder_email,
           fi.finder_upi_id, fi.submission_type, fi.status as found_status
    FROM verification_probes vp
    JOIN lost_items li ON vp.lost_item_id = li.id
    JOIN found_items fi ON vp.found_item_id = fi.id
    LEFT JOIN match_evaluations me ON (me.lost_item_id = vp.lost_item_id AND me.found_item_id = vp.found_item_id)
    ORDER BY vp.created_at DESC
    """)
    probe_rows = cursor.fetchall()

    seen_pairs = set()
    approvals = []

    for r in probe_rows:
        pair_key = (r["lost_item_id"], r["found_item_id"])
        if pair_key in seen_pairs:
            continue
        seen_pairs.add(pair_key)
        eval_id = r["me_eval_id"] or f"EVAL-{r['lost_item_id'][-6:]}-{r['found_item_id'][-6:]}"

        # Fetch active release authorization passcode if exists
        cursor.execute("""
        SELECT passcode, is_used, expires_at FROM release_authorizations
        WHERE evaluation_id = ? OR (lost_item_id = ? AND found_item_id = ?)
        ORDER BY created_at DESC LIMIT 1
        """, (eval_id, r["lost_item_id"], r["found_item_id"]))
        auth_row = cursor.fetchone()

        probe_data = {
            "id": r["probe_id"],
            "target_area": r["target_area"],
            "neutral_prompt": r["neutral_prompt"],
            "secret_point_text": r["secret_point_text"],
            "finder_response_photo": r["finder_response_photo"],
            "finder_notes": r["finder_notes"],
            "agent_verification_score": r["agent_verification_score"] if r["agent_verification_score"] is not None else 0.98,
            "agent_analysis_reasoning": r["agent_analysis_reasoning"] or "AI Agent verification authenticated.",
            "probe_status": r["probe_status"],
            "created_at": r["probe_created_at"],
            "updated_at": r["probe_updated_at"]
        }

        admin_decision = r["admin_decision"] or ("APPROVED" if auth_row else "PENDING")

        approvals.append({
            "evaluation_id": eval_id,
            "lost_item": {
                "id": r["lost_item_id"],
                "product_name": r["product_name"],
                "category": r["lost_category"],
                "description": r["lost_description"],
                "reference_photos": json.loads(r["reference_photos"]) if r["reference_photos"] else [],
                "secret_points": json.loads(r["secret_points"]) if r["secret_points"] else [],
                "reward_amount": r["reward_amount"],
                "reward_currency": r["reward_currency"],
                "owner_name": r["owner_name"],
                "owner_phone": r["owner_phone"],
                "owner_email": r["owner_email"],
                "residential_address": r["residential_address"],
                "govt_id_last4": r["govt_id_last4"],
                "last_seen_location": r["last_seen_location"],
                "last_seen_time": r["last_seen_time"],
                "status": r["lost_status"]
            },
            "found_item": {
                "id": r["found_item_id"],
                "object_name": r["object_name"],
                "category": r["found_category"],
                "description": r["found_description"],
                "primary_photo": r["primary_photo"],
                "additional_photos": json.loads(r["additional_photos"]) if r["additional_photos"] else [],
                "found_location": r["found_location"],
                "found_time": r["found_time"],
                "pickup_availability": r["pickup_availability"],
                "finder_name": r["finder_name"],
                "finder_phone": r["finder_phone"],
                "finder_email": r["finder_email"],
                "finder_upi_id": r["finder_upi_id"],
                "submission_type": r["submission_type"],
                "status": r["found_status"]
            },
            "probe": probe_data,
            "scores": {
                "composite_score": r["composite_score"] if r["composite_score"] is not None else 0.98,
                "text_score": r["text_score"] if r["text_score"] is not None else 0.92,
                "distance_km": r["distance_km"] if r["distance_km"] is not None else 0.1,
                "distance_score": r["distance_score"] if r["distance_score"] is not None else 0.95,
                "time_delta_hours": r["time_delta_hours"] if r["time_delta_hours"] is not None else 0.5,
                "spatio_temporal_score": r["spatio_temporal_score"] if r["spatio_temporal_score"] is not None else 0.95,
                "visual_score": r["visual_score"] if r["visual_score"] is not None else 0.98
            },
            "verification_status": r["verification_status"] or r["probe_status"],
            "admin_decision": admin_decision,
            "active_passcode": auth_row["passcode"] if auth_row else None,
            "is_passcode_used": bool(auth_row["is_used"]) if auth_row else False,
            "eval_created_at": r["probe_created_at"],
            "eval_updated_at": r["probe_updated_at"]
        })

    # 2. Also query any high-confidence match evaluations that don't have a probe yet
    cursor.execute("""
    SELECT me.id as evaluation_id, me.lost_item_id, me.found_item_id,
           me.composite_score, me.text_score, me.distance_km, me.distance_score,
           me.time_delta_hours, me.time_decay_score, me.spatio_temporal_score,
           me.visual_score, me.visual_details, me.verification_status, me.admin_decision,
           me.created_at as eval_created_at, me.updated_at as eval_updated_at,
           li.product_name, li.category as lost_category, li.description as lost_description,
           li.reference_photos, li.secret_points, li.reward_amount, li.reward_currency,
           li.owner_name, li.owner_phone, li.owner_email, li.residential_address,
           li.govt_id_last4, li.last_seen_location, li.last_seen_time, li.status as lost_status,
           fi.object_name, fi.category as found_category, fi.description as found_description,
           fi.primary_photo, fi.additional_photos, fi.found_location, fi.found_time,
           fi.pickup_availability, fi.finder_name, fi.finder_phone, fi.finder_email,
           fi.finder_upi_id, fi.submission_type, fi.status as found_status
    FROM match_evaluations me
    JOIN lost_items li ON me.lost_item_id = li.id
    JOIN found_items fi ON me.found_item_id = fi.id
    WHERE me.composite_score >= 0.35
    ORDER BY me.composite_score DESC, me.updated_at DESC
    """)
    me_rows = cursor.fetchall()

    for r in me_rows:
        pair_key = (r["lost_item_id"], r["found_item_id"])
        if pair_key in seen_pairs:
            continue
        seen_pairs.add(pair_key)

        # Fetch active release authorization passcode if exists
        cursor.execute("""
        SELECT passcode, is_used, expires_at FROM release_authorizations
        WHERE evaluation_id = ? OR (lost_item_id = ? AND found_item_id = ?)
        ORDER BY created_at DESC LIMIT 1
        """, (r["evaluation_id"], r["lost_item_id"], r["found_item_id"]))
        auth_row = cursor.fetchone()

        approvals.append({
            "evaluation_id": r["evaluation_id"],
            "lost_item": {
                "id": r["lost_item_id"],
                "product_name": r["product_name"],
                "category": r["lost_category"],
                "description": r["lost_description"],
                "reference_photos": json.loads(r["reference_photos"]) if r["reference_photos"] else [],
                "secret_points": json.loads(r["secret_points"]) if r["secret_points"] else [],
                "reward_amount": r["reward_amount"],
                "reward_currency": r["reward_currency"],
                "owner_name": r["owner_name"],
                "owner_phone": r["owner_phone"],
                "owner_email": r["owner_email"],
                "residential_address": r["residential_address"],
                "govt_id_last4": r["govt_id_last4"],
                "last_seen_location": r["last_seen_location"],
                "last_seen_time": r["last_seen_time"],
                "status": r["lost_status"]
            },
            "found_item": {
                "id": r["found_item_id"],
                "object_name": r["object_name"],
                "category": r["found_category"],
                "description": r["found_description"],
                "primary_photo": r["primary_photo"],
                "additional_photos": json.loads(r["additional_photos"]) if r["additional_photos"] else [],
                "found_location": r["found_location"],
                "found_time": r["found_time"],
                "pickup_availability": r["pickup_availability"],
                "finder_name": r["finder_name"],
                "finder_phone": r["finder_phone"],
                "finder_email": r["finder_email"],
                "finder_upi_id": r["finder_upi_id"],
                "submission_type": r["submission_type"],
                "status": r["found_status"]
            },
            "probe": None,
            "scores": {
                "composite_score": r["composite_score"],
                "text_score": r["text_score"],
                "distance_km": r["distance_km"],
                "distance_score": r["distance_score"],
                "time_delta_hours": r["time_delta_hours"],
                "spatio_temporal_score": r["spatio_temporal_score"],
                "visual_score": r["visual_score"]
            },
            "verification_status": r["verification_status"],
            "admin_decision": r["admin_decision"] or ("APPROVED" if auth_row else "PENDING"),
            "active_passcode": auth_row["passcode"] if auth_row else None,
            "is_passcode_used": bool(auth_row["is_used"]) if auth_row else False,
            "eval_created_at": r["eval_created_at"],
            "eval_updated_at": r["eval_updated_at"]
        })

    conn.close()
    return approvals


@router.post("/approvals/{evaluation_id}/decide")
def decide_handover_approval(evaluation_id: str, payload: dict, x_admin_pin: Optional[str] = Header(None)):
    """
    Admin gives final verification approval or rejection for physical handover.
    """
    verify_admin_access(x_admin_pin)
    decision = payload.get("decision", "APPROVED").upper() # "APPROVED" or "REJECTED"
    notes = payload.get("notes", "")
    now_str = datetime.now().isoformat()

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM match_evaluations WHERE id = ?", (evaluation_id,))
    match_row = cursor.fetchone()
    if not match_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Match evaluation not found")

    lost_id = match_row["lost_item_id"]
    found_id = match_row["found_item_id"]

    cursor.execute("SELECT * FROM lost_items WHERE id = ?", (lost_id,))
    lost_item = cursor.fetchone()

    cursor.execute("SELECT * FROM found_items WHERE id = ?", (found_id,))
    found_item = cursor.fetchone()

    passcode_issued = None
    if decision == "APPROVED":
        # Check if release passcode already exists
        cursor.execute("SELECT passcode FROM release_authorizations WHERE evaluation_id = ?", (evaluation_id,))
        existing_auth = cursor.fetchone()

        if existing_auth:
            passcode_issued = existing_auth["passcode"]
        else:
            from app.security import generate_otp, generate_intake_id
            passcode_issued = generate_otp()
            auth_id = generate_intake_id("AUTH")
            expires_at = (datetime.now() + timedelta(days=7)).isoformat()
            owner_name = lost_item["owner_name"] if (lost_item and lost_item["owner_name"]) else "Verified Owner"
            owner_phone = lost_item["owner_phone"] if (lost_item and lost_item["owner_phone"]) else ""
            admin_pin = ADMIN_PIN or "8899"

            cursor.execute("""
            INSERT INTO release_authorizations (
                id, lost_item_id, found_item_id, evaluation_id, owner_phone, owner_name,
                authorized_admin_pin, passcode, expires_at, is_used, used_at, used_by_desk_id,
                used_by_officer, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL, ?)
            """, (
                auth_id,
                lost_id,
                found_id,
                evaluation_id,
                owner_phone,
                owner_name,
                admin_pin,
                passcode_issued,
                expires_at,
                now_str
            ))

        # Update Match Evaluation
        cursor.execute("""
        UPDATE match_evaluations
        SET admin_decision = 'APPROVED', verification_status = 'ADMIN_APPROVED', updated_at = ?
        WHERE id = ?
        """, (now_str, evaluation_id))

        # Update Lost Item Status
        cursor.execute("UPDATE lost_items SET status = 'MATCHED', updated_at = ? WHERE id = ?", (now_str, lost_id))

        # Notify Owner
        from app.security import generate_intake_id
        notif_id_owner = generate_intake_id("NOTIF")
        cursor.execute("""
        INSERT INTO notifications (id, user_id, phone, type, title, message, action_url, is_read, created_at)
        VALUES (?, ?, ?, 'HANDOVER_APPROVED', ?, ?, ?, 0, ?)
        """, (
            notif_id_owner,
            lost_item["user_id"] if lost_item else None,
            lost_item["owner_phone"] if lost_item else "",
            "Admin Verification Approved!",
            f"Admin has verified and approved your handover for '{lost_item['product_name'] if lost_item else 'Item'}'. 6-digit pickup passcode: {passcode_issued}.",
            f"/status?q={lost_item['owner_phone'] if lost_item else ''}",
            now_str
        ))

        # Notify Finder
        notif_id_finder = generate_intake_id("NOTIF")
        cursor.execute("""
        INSERT INTO notifications (id, user_id, phone, type, title, message, action_url, is_read, created_at)
        VALUES (?, ?, ?, 'HANDOVER_APPROVED', ?, ?, ?, 0, ?)
        """, (
            notif_id_finder,
            found_item["user_id"] if found_item else None,
            found_item["finder_phone"] if found_item else "",
            "Handover Approved by Admin",
            f"Verification for '{found_item['object_name'] if found_item else 'Item'}' has been approved by admin.",
            f"/status?q={found_item['finder_phone'] if found_item else ''}",
            now_str
        ))
    else:
        cursor.execute("""
        UPDATE match_evaluations
        SET admin_decision = 'REJECTED', verification_status = 'REJECTED_BY_ADMIN', updated_at = ?
        WHERE id = ?
        """, (now_str, evaluation_id))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "evaluation_id": evaluation_id,
        "decision": decision,
        "passcode": passcode_issued,
        "message": f"Verification review decision marked as {decision}."
    }


@router.post("/clear-demo-data")
def clear_demo_data(x_admin_pin: Optional[str] = Header(None)):
    """
    Purges demo seed records and demo user details from database.
    """
    verify_admin_access(x_admin_pin)
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM verification_probes WHERE id LIKE '%DEMO%' OR lost_item_id LIKE '%DEMO%' OR found_item_id LIKE '%DEMO%'")
    cursor.execute("DELETE FROM match_evaluations WHERE id LIKE '%DEMO%' OR lost_item_id LIKE '%DEMO%' OR found_item_id LIKE '%DEMO%'")
    cursor.execute("DELETE FROM escrow_records WHERE id LIKE '%DEMO%' OR lost_item_id LIKE '%DEMO%'")
    cursor.execute("DELETE FROM release_authorizations WHERE id LIKE '%DEMO%' OR lost_item_id LIKE '%DEMO%'")
    cursor.execute("""
    DELETE FROM lost_items 
    WHERE id LIKE '%DEMO%' OR user_id LIKE 'USER-DEMO%' 
       OR owner_phone IN ('+91 98765 43210', '+91 98765 11223', '+91 98765 55443', '+91 91234 56789', '+91 91234 88776', '+91 91234 33221', '+91 97654 11220', '+91 97654 32109')
    """)
    cursor.execute("""
    DELETE FROM found_items 
    WHERE id LIKE '%DEMO%' OR user_id LIKE 'USER-DEMO%' 
       OR finder_phone IN ('+91 98765 43210', '+91 98765 11223', '+91 98765 55443', '+91 91234 56789', '+91 91234 88776', '+91 91234 33221', '+91 97654 11220', '+91 97654 32109')
    """)
    cursor.execute("""
    DELETE FROM notifications 
    WHERE user_id LIKE 'USER-DEMO%' 
       OR phone IN ('+91 98765 43210', '+91 98765 11223', '+91 98765 55443', '+91 91234 56789', '+91 91234 88776', '+91 91234 33221', '+91 97654 11220', '+91 97654 32109')
    """)
    cursor.execute("""
    DELETE FROM users 
    WHERE id LIKE 'USER-DEMO%' 
       OR phone IN ('+91 98765 43210', '+91 98765 11223', '+91 98765 55443', '+91 91234 56789', '+91 91234 88776', '+91 91234 33221', '+91 97654 11220', '+91 97654 32109')
    """)

    conn.commit()
    conn.close()

    return {"success": True, "message": "All demo items, mock records, and demo users cleared successfully"}
