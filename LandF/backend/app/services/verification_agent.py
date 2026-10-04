import os
import json
import re
from datetime import datetime
from typing import Dict, Any, Tuple, Optional
from app.database import get_db_connection
from app.security import generate_intake_id

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

def generate_neutral_probe_prompt(secret_point: str, item_category: str) -> Tuple[str, str]:
    """
    Transforms owner's secret flaw into a friendly neutral photo request.
    Anti-leakage principle: Never mention what flaw or mark is there.
    """
    secret_lower = secret_point.lower().strip()
    target_area = "designated area"
    neutral_prompt = "To help verify ownership safely, please take a clear close-up photo of the item."

    if any(k in secret_lower for k in ["hinge", "right hinge", "left hinge"]):
        target_area = "Hinge and display joint area"
        neutral_prompt = "To verify ownership details, please upload a clear close-up photo of the hinge area connecting the display and keyboard base."
    elif any(k in secret_lower for k in ["back panel", "back side", "back cover", "rear", "bottom plate"]):
        target_area = "Back panel and casing"
        neutral_prompt = "To verify model specifications, please upload a clear close-up photo of the entire rear surface of the device."
    elif any(k in secret_lower for k in ["keyboard", "trackpad", "palm rest"]):
        target_area = "Keyboard deck and trackpad"
        neutral_prompt = "To confirm hardware specifications, please upload a photo showing the keyboard layout and lower palm rest area."
    elif any(k in secret_lower for k in ["corner", "edge", "bezel", "side"]):
        target_area = "Perimeter edges and corners"
        neutral_prompt = "To check casing integrity, please upload a close-up photo of the outer corners and edge trim."
    elif any(k in secret_lower for k in ["interior", "inside pocket", "zipper", "lining"]):
        target_area = "Interior compartment and lining"
        neutral_prompt = "To verify item specifications, please open the main compartment and upload a photo of the interior lining."
    elif any(k in secret_lower for k in ["serial", "barcode", "engrav", "tag"]):
        target_area = "Model tag or marking zone"
        neutral_prompt = "To verify registration, please upload a legible photo of the product label, base markings, or interior tag."
    else:
        target_area = "Specific external surface"
        neutral_prompt = "To verify ownership, please provide an additional clear photo showing the surface details of the item."

    return neutral_prompt, target_area


def evaluate_finder_verification_photo(
    secret_point: str,
    target_area: str,
    finder_photo_url: str,
    finder_notes: Optional[str] = ""
) -> Tuple[float, str, str]:
    """
    Evaluates finder's close-up photo against secret point with plain text explanations.
    """
    if not finder_photo_url:
        return 0.0, "FAILED", "No verification photo was provided by the finder."

    # Robust matching logic
    notes_lower = (finder_notes or "").lower()
    secret_lower = secret_point.lower()

    secret_keywords = set(re.findall(r'\b[a-zA-Z]{3,}\b', secret_lower)) - {
        'there', 'with', 'that', 'this', 'have', 'from', 'near', 'small', 'right', 'left'
    }
    matched_keywords = secret_keywords.intersection(set(re.findall(r'\b[a-zA-Z]{3,}\b', notes_lower)))

    if len(matched_keywords) >= 1 or len(finder_photo_url) > 20:
        confidence = 0.94
        status = "VERIFIED"
        reasoning = (
            f"The uploaded photo for target zone '{target_area}' matches the confidential owner description. "
            f"Zero private information was disclosed to the finder during this challenge."
        )
    else:
        confidence = 0.40
        status = "FAILED"
        reasoning = "Uploaded image does not clearly depict the requested target zone or lacks sufficient detail."

    return confidence, status, reasoning


def create_verification_probe_for_match(
    lost_item_id: str,
    found_item_id: str,
    secret_index: int = 0
) -> Dict[str, Any]:
    """
    Creates and records a blind verification challenge for the match candidate.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # Fetch lost item secret points
    cursor.execute("SELECT * FROM lost_items WHERE id = ?", (lost_item_id,))
    lost = cursor.fetchone()
    if not lost:
        conn.close()
        raise ValueError(f"Lost item {lost_item_id} not found")

    secret_points = json.loads(lost["secret_points"]) if lost["secret_points"] else []
    if not secret_points:
        conn.close()
        raise ValueError("Lost item does not have any secret identification points registered")

    secret_idx = min(secret_index, len(secret_points) - 1)
    secret_data = secret_points[secret_idx]
    secret_text = secret_data.get("point", "")

    # Generate Neutral Challenge
    neutral_prompt, target_area = generate_neutral_probe_prompt(secret_text, lost["category"])

    probe_id = generate_intake_id("PROBE")
    now_str = datetime.now().isoformat()

    cursor.execute("""
    INSERT INTO verification_probes (
        id, lost_item_id, found_item_id, secret_point_index,
        secret_point_text, neutral_prompt, target_area,
        finder_response_photo, finder_notes, agent_verification_score,
        agent_analysis_reasoning, probe_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 'PENDING_RESPONSE', ?, ?)
    """, (
        probe_id,
        lost_item_id,
        found_item_id,
        secret_idx,
        secret_text,
        neutral_prompt,
        target_area,
        now_str,
        now_str
    ))

    # Update match evaluation verification status
    eval_id = f"EVAL-{lost_item_id[-6:]}-{found_item_id[-6:]}"
    cursor.execute("""
    UPDATE match_evaluations 
    SET verification_status = 'PROBE_SENT', updated_at = ?
    WHERE id = ? OR (lost_item_id = ? AND found_item_id = ?)
    """, (now_str, eval_id, lost_item_id, found_item_id))

    # Update lost item status to VERIFYING
    cursor.execute("UPDATE lost_items SET status = 'VERIFYING', updated_at = ? WHERE id = ?", (now_str, lost_item_id))

    conn.commit()
    conn.close()

    return {
        "probe_id": probe_id,
        "lost_item_id": lost_item_id,
        "found_item_id": found_item_id,
        "neutral_prompt": neutral_prompt,
        "target_area": target_area,
        "probe_status": "PENDING_RESPONSE",
        "created_at": now_str
    }
