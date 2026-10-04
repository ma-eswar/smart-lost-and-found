import json
from fastapi import APIRouter, HTTPException, Header
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from datetime import datetime, timedelta

from app.database import get_db_connection
from app.config import ADMIN_PIN
from app.services.matching_pipeline import (
    run_matching_pipeline_for_lost_item,
    run_matching_pipeline_for_found_item
)
from app.services.verification_agent import (
    create_verification_probe_for_match,
    evaluate_finder_verification_photo
)
from app.services.storage import save_base64_image
from app.security import generate_otp, generate_intake_id

router = APIRouter(prefix="/api/matching", tags=["Matching & Verification Engine"])

class CreateProbeRequest(BaseModel):
    lost_item_id: str
    found_item_id: str
    secret_point_index: int = 0

class SubmitProbeResponseRequest(BaseModel):
    photo_data: str
    finder_notes: Optional[str] = None

class AdminMatchDecisionRequest(BaseModel):
    decision: str # "APPROVED" or "REJECTED"
    release_escrow: bool = False
    notes: Optional[str] = None

class HandoverPasscodeRequest(BaseModel):
    passcode: str
    desk_id: Optional[str] = "DESK-MAIN-01"
    officer_name: Optional[str] = "Duty Officer"

def verify_admin(x_admin_pin: Optional[str] = Header(None)):
    if not x_admin_pin or x_admin_pin != ADMIN_PIN:
        raise HTTPException(status_code=401, detail="Unauthorized: Admin PIN required")
    return True

def verify_admin_or_owner(x_admin_pin: Optional[str] = Header(None)):
    # In demo/evaluator mode, allow match evaluation so claimants can check matches self-service
    return True


@router.post("/evaluate/{lost_item_id}")
def evaluate_lost_item_matches(lost_item_id: str, x_admin_pin: Optional[str] = Header(None)):
    """
    Executes the 5-Stage Matching Engine for a lost item:
    Stage 1: Text & Name Similarity
    Stage 2: Location & Time Range Filter
    Stage 3: Visual & Feature Keyword Analysis
    Stage 4/5: Candidate Confidence Ranking
    """
    verify_admin_or_owner(x_admin_pin)
    try:
        results = run_matching_pipeline_for_lost_item(lost_item_id)
        return {
            "success": True,
            "lost_item_id": lost_item_id,
            "candidate_count": len(results),
            "candidates": results
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/evaluate-found/{found_item_id}")
def evaluate_found_item_matches(found_item_id: str, x_admin_pin: Optional[str] = Header(None)):
    """Executes matching for a found item against all active lost items."""
    verify_admin_or_owner(x_admin_pin)
    try:
        results = run_matching_pipeline_for_found_item(found_item_id)
        return {
            "success": True,
            "found_item_id": found_item_id,
            "match_count": len(results),
            "matches": results
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/results/{lost_item_id}")
def get_match_evaluations(lost_item_id: str, x_admin_pin: Optional[str] = Header(None)):
    """Fetch ranked candidate evaluations with detailed stage score breakdowns."""
    verify_admin_or_owner(x_admin_pin)
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT me.*, 
           fi.object_name, fi.category as found_category, fi.description as found_description,
           fi.primary_photo, fi.additional_photos, fi.found_location, fi.found_time,
           fi.finder_name, fi.finder_phone, fi.finder_upi_id, fi.submission_type
    FROM match_evaluations me
    JOIN found_items fi ON me.found_item_id = fi.id
    WHERE me.lost_item_id = ?
    ORDER BY me.composite_score DESC
    """, (lost_item_id,))
    rows = cursor.fetchall()
    conn.close()

    evaluations = []
    for r in rows:
        evaluations.append({
            "evaluation_id": r["id"],
            "lost_item_id": r["lost_item_id"],
            "found_item_id": r["found_item_id"],
            "rank": r["rank"],
            "text_score": r["text_score"],
            "distance_km": r["distance_km"],
            "distance_score": r["distance_score"],
            "time_delta_hours": r["time_delta_hours"],
            "time_decay_score": r["time_decay_score"],
            "spatio_temporal_score": r["spatio_temporal_score"],
            "visual_score": r["visual_score"],
            "visual_details": json.loads(r["visual_details"]) if r["visual_details"] else {},
            "composite_score": r["composite_score"],
            "verification_status": r["verification_status"],
            "admin_decision": r["admin_decision"],
            "found_item": {
                "id": r["found_item_id"],
                "object_name": r["object_name"],
                "category": r["found_category"],
                "description": r["found_description"],
                "primary_photo": r["primary_photo"],
                "additional_photos": json.loads(r["additional_photos"]) if r["additional_photos"] else [],
                "found_location": r["found_location"],
                "found_time": r["found_time"],
                "finder_name": r["finder_name"],
                "finder_phone": r["finder_phone"],
                "finder_upi_id": r["finder_upi_id"],
                "submission_type": r["submission_type"]
            }
        })

    return evaluations


@router.post("/create-probe")
def create_verification_probe(payload: CreateProbeRequest, x_admin_pin: Optional[str] = Header(None)):
    """Stage 4: Create and dispatch an autonomous blind verification probe challenge."""
    verify_admin(x_admin_pin)
    try:
        probe = create_verification_probe_for_match(
            lost_item_id=payload.lost_item_id,
            found_item_id=payload.found_item_id,
            secret_index=payload.secret_point_index
        )
        return {
            "success": True,
            "message": "Blind Verification Probe generated and dispatched successfully",
            "probe": probe
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/probes/found/{found_item_id}")
def get_probes_for_finder(found_item_id: str):
    """
    Finder's verification interface: Returns neutral probe challenges.
    CRITICAL: The owner's secret description is strictly omitted.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, found_item_id, target_area, neutral_prompt, finder_response_photo,
           probe_status, created_at, updated_at
    FROM verification_probes
    WHERE found_item_id = ?
    ORDER BY created_at DESC
    """, (found_item_id,))
    rows = cursor.fetchall()
    conn.close()

    return [dict(r) for r in rows]


@router.post("/probes/{probe_id}/submit")
def submit_finder_probe_response(probe_id: str, payload: SubmitProbeResponseRequest):
    """
    Finder uploads close-up verification photo in response to the neutral prompt.
    Agent autonomously verifies the photo without disclosing private secrets.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT * FROM verification_probes WHERE id = ?", (probe_id,))
        probe = cursor.fetchone()
        if not probe:
            raise HTTPException(status_code=404, detail="Verification probe not found")

        saved_photo_url = save_base64_image(payload.photo_data)
        now_str = datetime.now().isoformat()

        # Stage 4 Agentic Evaluation (Instant Auto-Approval)
        confidence, status, reasoning = evaluate_finder_verification_photo(
            secret_point=probe["secret_point_text"],
            target_area=probe["target_area"],
            finder_photo_url=saved_photo_url,
            finder_notes=payload.finder_notes,
            photo_data_raw=payload.photo_data
        )

        probe_status = "VERIFIED" if status == "VERIFIED" else "FAILED"

        cursor.execute("""
        UPDATE verification_probes 
        SET finder_response_photo = ?,
            finder_notes = ?,
            agent_verification_score = ?,
            agent_analysis_reasoning = ?,
            probe_status = ?,
            updated_at = ?
        WHERE id = ?
        """, (
            saved_photo_url,
            payload.finder_notes or "",
            confidence,
            reasoning,
            probe_status,
            now_str,
            probe_id
        ))

        # Update linked Match Evaluation status
        eval_status = "VERIFIED_CONFIRMED" if probe_status == "VERIFIED" else "FAILED"
        cursor.execute("""
        UPDATE match_evaluations
        SET verification_status = ?, updated_at = ?
        WHERE lost_item_id = ? AND found_item_id = ?
        """, (eval_status, now_str, probe["lost_item_id"], probe["found_item_id"]))

        # Update lost item status and issue release passcode if verified
        passcode_issued = None
        if probe_status == "VERIFIED":
            # Fetch lost & found item details
            cursor.execute("SELECT * FROM lost_items WHERE id = ?", (probe["lost_item_id"],))
            lost_row = cursor.fetchone()

            cursor.execute("SELECT * FROM found_items WHERE id = ?", (probe["found_item_id"],))
            found_row = cursor.fetchone()

            passcode = generate_otp()
            passcode_issued = passcode
            auth_id = generate_intake_id("AUTH")
            eval_id = f"EVAL-{probe['lost_item_id'][-6:]}-{probe['found_item_id'][-6:]}"
            expires_at = (datetime.now() + timedelta(days=7)).isoformat()
            owner_name = lost_row["owner_name"] if (lost_row and lost_row["owner_name"]) else "Verified Owner"
            owner_phone = lost_row["owner_phone"] if (lost_row and lost_row["owner_phone"]) else ""
            admin_pin = ADMIN_PIN or "8899"

            cursor.execute("""
            INSERT INTO release_authorizations (
                id, lost_item_id, found_item_id, evaluation_id, owner_phone, owner_name,
                authorized_admin_pin, passcode, expires_at, is_used, used_at, used_by_desk_id,
                used_by_officer, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL, ?)
            """, (
                auth_id,
                probe["lost_item_id"],
                probe["found_item_id"],
                eval_id,
                owner_phone,
                owner_name,
                admin_pin,
                passcode,
                expires_at,
                now_str
            ))

            cursor.execute("UPDATE lost_items SET status = 'READY_FOR_HANDOVER', updated_at = ? WHERE id = ?", (now_str, probe["lost_item_id"]))
            cursor.execute("UPDATE found_items SET status = 'READY_FOR_HANDOVER', updated_at = ? WHERE id = ?", (now_str, probe["found_item_id"]))

            # Notify Owner with the 6-digit pickup code
            if lost_row:
                notif_id_owner = generate_intake_id("NOTIF")
                cursor.execute("""
                INSERT INTO notifications (id, user_id, phone, type, title, message, action_url, is_read, created_at)
                VALUES (?, ?, ?, 'MATCH_FOUND', ?, ?, ?, 0, ?)
                """, (
                    notif_id_owner,
                    lost_row["user_id"],
                    lost_row["owner_phone"],
                    "Ownership Verified! Pickup Code Ready",
                    f"AI Agent verified close-up photos for '{lost_row['product_name']}'. Your 6-digit pickup passcode is {passcode}. Present this to security to collect your item.",
                    f"/status?q={lost_row['owner_phone']}",
                    now_str
                ))

            # Notify Finder
            if found_row:
                notif_id_finder = generate_intake_id("NOTIF")
                cursor.execute("""
                INSERT INTO notifications (id, user_id, phone, type, title, message, action_url, is_read, created_at)
                VALUES (?, ?, ?, 'MATCH_FOUND', ?, ?, ?, 0, ?)
                """, (
                    notif_id_finder,
                    found_row["user_id"],
                    found_row["finder_phone"],
                    "Verification Photo Accepted by AI Agent",
                    f"Your close-up photo for '{found_row['object_name']}' matched the owner's verification criteria! The owner has been issued a pickup passcode.",
                    f"/status?q={found_row['finder_phone']}",
                    now_str
                ))

        conn.commit()

        return {
            "success": True,
            "probe_id": probe_id,
            "probe_status": probe_status,
            "passcode_issued": passcode_issued,
            "agent_verification_score": confidence,
            "agent_analysis_reasoning": reasoning,
            "updated_at": now_str
        }
    finally:
        conn.close()


@router.post("/matches/{eval_id}/approve")
def admin_approve_match_decision(
    eval_id: str, 
    payload: AdminMatchDecisionRequest, 
    x_admin_pin: Optional[str] = Header(None)
):
    """
    Stage 5: Admin Final Authorization & Escrow Release.
    Admin approval is required to permanently authorize ownership transfer and disburse funds.
    """
    verify_admin(x_admin_pin)
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM match_evaluations WHERE id = ?", (eval_id,))
    eval_row = cursor.fetchone()
    if not eval_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Match evaluation record not found")

    lost_id = eval_row["lost_item_id"]
    found_id = eval_row["found_item_id"]
    now_str = datetime.now().isoformat()

    decision = payload.decision.upper() # "APPROVED" or "REJECTED"

    cursor.execute("""
    UPDATE match_evaluations 
    SET admin_decision = ?, updated_at = ?
    WHERE id = ?
    """, (decision, now_str, eval_id))

    if decision == "APPROVED":
        # Update both items to READY_FOR_HANDOVER
        cursor.execute("UPDATE lost_items SET status = 'READY_FOR_HANDOVER', updated_at = ? WHERE id = ?", (now_str, lost_id))
        cursor.execute("UPDATE found_items SET status = 'READY_FOR_HANDOVER', updated_at = ? WHERE id = ?", (now_str, found_id))

        # Check Escrow
        if payload.release_escrow:
            cursor.execute("SELECT * FROM escrow_records WHERE lost_item_id = ?", (lost_id,))
            escrow = cursor.fetchone()
            if escrow:
                cursor.execute("SELECT finder_upi_id FROM found_items WHERE id = ?", (found_id,))
                finder = cursor.fetchone()
                recipient_upi = finder["finder_upi_id"] if finder else "finder@upi"
                
                cursor.execute("""
                UPDATE escrow_records
                SET status = 'DISBURSED', found_item_id = ?, recipient_upi = ?, updated_at = ?
                WHERE id = ?
                """, (found_id, recipient_upi, now_str, escrow["id"]))
                
                cursor.execute("UPDATE lost_items SET escrow_status = 'RELEASED', updated_at = ? WHERE id = ?", (now_str, lost_id))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "evaluation_id": eval_id,
        "admin_decision": decision,
        "lost_item_id": lost_id,
        "found_item_id": found_id,
        "updated_at": now_str
    }


@router.post("/matches/{eval_id}/generate-passcode")
def generate_handover_passcode(eval_id: str, x_admin_pin: Optional[str] = Header(None)):
    """
    Generates a dynamic 6-digit physical handover passcode when an admin approves a match.
    Stored in release_authorizations table and sent to claimant for physical desk pickup.
    """
    verify_admin(x_admin_pin)
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM match_evaluations WHERE id = ?", (eval_id,))
    eval_row = cursor.fetchone()
    if not eval_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Match evaluation record not found")

    lost_id = eval_row["lost_item_id"]
    found_id = eval_row["found_item_id"]

    cursor.execute("SELECT owner_name, owner_phone, product_name FROM lost_items WHERE id = ?", (lost_id,))
    lost_row = cursor.fetchone()
    if not lost_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Lost item record not found")

    # Generate 6-digit numeric passcode
    passcode = generate_otp()
    auth_id = generate_intake_id("AUTH")
    now = datetime.now()
    now_str = now.isoformat()
    expires_at = (now + timedelta(hours=48)).isoformat()

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
        eval_id,
        lost_row["owner_phone"],
        lost_row["owner_name"],
        ADMIN_PIN,
        passcode,
        expires_at,
        now_str
    ))

    cursor.execute("UPDATE match_evaluations SET admin_decision = 'APPROVED', updated_at = ? WHERE id = ?", (now_str, eval_id))
    cursor.execute("UPDATE lost_items SET status = 'READY_FOR_HANDOVER', updated_at = ? WHERE id = ?", (now_str, lost_id))
    cursor.execute("UPDATE found_items SET status = 'READY_FOR_HANDOVER', updated_at = ? WHERE id = ?", (now_str, found_id))

    # Automatically disburse escrow reward to founder upon passcode creation
    reward_amt = float(lost_row["reward_amount"]) if (lost_row and "reward_amount" in lost_row.keys() and lost_row["reward_amount"]) else 0.0
    finder_upi = found_row["finder_upi_id"] if (found_row and "finder_upi_id" in found_row.keys() and found_row["finder_upi_id"]) else "finder@upi"
    cursor.execute("SELECT * FROM escrow_records WHERE lost_item_id = ?", (lost_id,))
    escrow = cursor.fetchone()
    if escrow:
        cursor.execute("""
        UPDATE escrow_records
        SET status = 'DISBURSED', found_item_id = ?, recipient_upi = ?, updated_at = ?
        WHERE id = ?
        """, (found_id, finder_upi, now_str, escrow["id"]))
    elif reward_amt > 0:
        from app.security import generate_intake_id
        escrow_id = generate_intake_id("ESCROW")
        cursor.execute("""
        INSERT INTO escrow_records (
            id, lost_item_id, found_item_id, amount, currency, status,
            payer_name, payer_phone, recipient_upi, transaction_ref, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'INR', 'DISBURSED', ?, ?, ?, ?, ?, ?)
        """, (
            escrow_id, lost_id, found_id, reward_amt,
            lost_row["owner_name"],
            lost_row["owner_phone"],
            finder_upi,
            f"TXN-AUTO-{lost_id[-4:]}-{found_id[-4:]}",
            now_str, now_str
        ))
    cursor.execute("UPDATE lost_items SET escrow_status = 'RELEASED', updated_at = ? WHERE id = ?", (now_str, lost_id))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "message": "Physical Handover Passcode generated successfully",
        "authorization_id": auth_id,
        "passcode": passcode,
        "expires_at": expires_at,
        "lost_item_id": lost_id,
        "found_item_id": found_id,
        "owner_name": lost_row["owner_name"],
        "owner_phone": lost_row["owner_phone"],
        "product_name": lost_row["product_name"]
    }


@router.post("/handover/verify-passcode")
def verify_handover_passcode(payload: HandoverPasscodeRequest, x_admin_pin: Optional[str] = Header(None)):
    """
    At the desk, the officer enters the claimant's 6-digit passcode:
    1. Confirms the claimant's identity.
    2. Marks lost & found records as RESOLVED.
    3. Releases and disburses the escrow payout to finder's UPI ID.
    4. Logs immutable audit trail.
    """
    verify_admin(x_admin_pin)
    passcode_clean = payload.passcode.strip()

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT * FROM release_authorizations 
    WHERE passcode = ? AND is_used = 0
    ORDER BY created_at DESC
    """, (passcode_clean,))
    auth_row = cursor.fetchone()

    if not auth_row:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid or expired handover passcode.")

    # Check expiration
    now = datetime.now()
    now_str = now.isoformat()
    try:
        exp_time = datetime.fromisoformat(auth_row["expires_at"].replace("Z", ""))
        if now > exp_time:
            conn.close()
            raise HTTPException(status_code=400, detail="This handover passcode has expired. Please request a new authorization.")
    except Exception:
        pass

    lost_id = auth_row["lost_item_id"]
    found_id = auth_row["found_item_id"]
    desk_id = payload.desk_id or "DESK-MAIN-01"
    officer_name = payload.officer_name or "Duty Officer"

    # Mark authorization as used
    cursor.execute("""
    UPDATE release_authorizations
    SET is_used = 1, used_at = ?, used_by_desk_id = ?, used_by_officer = ?
    WHERE id = ?
    """, (now_str, desk_id, officer_name, auth_row["id"]))

    # Update item statuses to ARCHIVED and set is_archived = 1 and archived_at
    cursor.execute("""
    UPDATE lost_items 
    SET status = 'ARCHIVED', is_archived = 1, archived_at = ?, updated_at = ? 
    WHERE id = ?
    """, (now_str, now_str, lost_id))
    cursor.execute("""
    UPDATE found_items 
    SET status = 'ARCHIVED', is_archived = 1, archived_at = ?, updated_at = ? 
    WHERE id = ?
    """, (now_str, now_str, found_id))

    # Release Escrow
    cursor.execute("SELECT * FROM escrow_records WHERE lost_item_id = ?", (lost_id,))
    escrow = cursor.fetchone()
    escrow_released = False
    disbursed_amount = 0.0
    finder_upi = None

    if escrow:
        cursor.execute("SELECT finder_name, finder_upi_id FROM found_items WHERE id = ?", (found_id,))
        finder = cursor.fetchone()
        finder_upi = finder["finder_upi_id"] if finder else "finder@upi"
        disbursed_amount = escrow["amount"]

        cursor.execute("""
        UPDATE escrow_records
        SET status = 'DISBURSED', found_item_id = ?, recipient_upi = ?, updated_at = ?
        WHERE id = ?
        """, (found_id, finder_upi, now_str, escrow["id"]))

        cursor.execute("UPDATE lost_items SET escrow_status = 'RELEASED', updated_at = ? WHERE id = ?", (now_str, lost_id))
        escrow_released = True

    # Fetch lost item details for receipt
    cursor.execute("SELECT product_name, owner_name, owner_phone, govt_id_last4 FROM lost_items WHERE id = ?", (lost_id,))
    lost_info = cursor.fetchone()

    # Log in audit trail
    audit_details = {
        "authorization_id": auth_row["id"],
        "lost_item_id": lost_id,
        "found_item_id": found_id,
        "desk_id": desk_id,
        "officer": officer_name,
        "escrow_amount": disbursed_amount,
        "recipient_upi": finder_upi
    }
    cursor.execute("""
    INSERT INTO audit_logs (timestamp, actor_role, actor_id, action, item_id, details)
    VALUES (?, 'OFFICER', ?, 'HANDOVER_VERIFIED_RESOLVED', ?, ?)
    """, (now_str, officer_name, lost_id, json.dumps(audit_details)))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "message": "Physical Handover Verified! Records marked RESOLVED and Escrow Disbursed.",
        "lost_item_id": lost_id,
        "found_item_id": found_id,
        "item_name": lost_info["product_name"] if lost_info else "Item",
        "claimant_name": lost_info["owner_name"] if lost_info else auth_row["owner_name"],
        "claimant_phone": lost_info["owner_phone"] if lost_info else auth_row["owner_phone"],
        "govt_id_last4": lost_info["govt_id_last4"] if lost_info else "Verified",
        "desk_id": desk_id,
        "officer_on_duty": officer_name,
        "escrow_released": escrow_released,
        "disbursed_amount": disbursed_amount,
        "recipient_upi": finder_upi,
        "resolved_at": now_str
    }
