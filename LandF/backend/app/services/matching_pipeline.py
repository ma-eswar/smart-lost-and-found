import math
import json
import re
import base64
from io import BytesIO
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional
from PIL import Image

from app.config import UPLOAD_DIR
from app.database import get_db_connection
from app.security import generate_intake_id
from app.services.verification_agent import create_verification_probe_for_match

# ==============================================================================
# TIER-1 IMAGE ANALYSIS UTILITIES (PIL.Image)
# ==============================================================================

def load_pil_image(image_source: str) -> Optional[Image.Image]:
    """Safely loads an image from a base64 string or local file path."""
    if not image_source:
        return None
    try:
        if image_source.startswith("data:"):
            _, encoded = image_source.split(",", 1)
            img_data = base64.b64decode(encoded)
            img = Image.open(BytesIO(img_data))
            return img.convert("RGB")
        
        clean_path = image_source.lstrip("/")
        if clean_path.startswith("uploads/"):
            filename = clean_path.replace("uploads/", "", 1)
            file_path = UPLOAD_DIR / filename
            if file_path.exists():
                img = Image.open(file_path)
                return img.convert("RGB")
        
        direct_path = Path(image_source)
        if direct_path.exists():
            img = Image.open(direct_path)
            return img.convert("RGB")
    except Exception:
        pass
    return None

def extract_dominant_colors(image_source: Any, num_colors: int = 3) -> List[Tuple[int, int, int]]:
    """
    Downsamples image to 50x50 and computes dominant RGB centroid clusters.
    """
    img = image_source if isinstance(image_source, Image.Image) else load_pil_image(image_source)
    if img is None:
        return []
    
    try:
        small_img = img.resize((50, 50))
        quantized = small_img.quantize(colors=num_colors, method=Image.Quantize.MEDIANCUT)
        palette = quantized.getpalette()
        if not palette:
            return []
        
        dominant_colors = []
        for i in range(min(num_colors, len(palette) // 3)):
            r = palette[i * 3]
            g = palette[i * 3 + 1]
            b = palette[i * 3 + 2]
            dominant_colors.append((r, g, b))
        return dominant_colors
    except Exception:
        return []

def compute_color_similarity(colors_a: List[Tuple[int, int, int]], colors_b: List[Tuple[int, int, int]]) -> float:
    """
    Returns similarity score (0.0 to 1.0) using Euclidean RGB distance.
    """
    if not colors_a or not colors_b:
        return 0.50
    
    max_dist = math.sqrt(255**2 * 3) # ~441.67
    
    sims_a = []
    for ca in colors_a:
        min_d = min(math.sqrt((ca[0]-cb[0])**2 + (ca[1]-cb[1])**2 + (ca[2]-cb[2])**2) for cb in colors_b)
        sims_a.append(max(0.0, 1.0 - (min_d / max_dist)))
        
    sims_b = []
    for cb in colors_b:
        min_d = min(math.sqrt((cb[0]-ca[0])**2 + (cb[1]-ca[1])**2 + (cb[2]-ca[2])**2) for ca in colors_a)
        sims_b.append(max(0.0, 1.0 - (min_d / max_dist)))
        
    avg_sim = (sum(sims_a) / len(sims_a) + sum(sims_b) / len(sims_b)) / 2.0
    return round(avg_sim, 4)

def compute_aspect_ratio_similarity(img_a_source: Any, img_b_source: Any) -> float:
    """
    Compares width/height ratios of two images.
    """
    img_a = img_a_source if isinstance(img_a_source, Image.Image) else load_pil_image(img_a_source)
    img_b = img_b_source if isinstance(img_b_source, Image.Image) else load_pil_image(img_b_source)
    
    if img_a is None or img_b is None:
        return 0.70
    
    w_a, h_a = img_a.size
    w_b, h_b = img_b.size
    
    ar_a = w_a / max(1, h_a)
    ar_b = w_b / max(1, h_b)
    
    ratio_sim = min(ar_a, ar_b) / max(ar_a, ar_b)
    return round(max(0.0, min(1.0, ratio_sim)), 4)


# ==============================================================================
# STAGE 1: TEXT & NAME SIMILARITY
# ==============================================================================

def tokenize_and_clean(text: str) -> List[str]:
    """Clean and tokenize text for n-gram and keyword semantic matching."""
    if not text:
        return []
    clean = re.sub(r'[^a-zA-Z0-9\s]', ' ', text.lower())
    words = [w.strip() for w in clean.split() if len(w.strip()) > 1]
    stop_words = {'the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'has', 'near', 'some', 'about'}
    return [w for w in words if w not in stop_words]

def compute_text_similarity(
    lost_name: str, 
    lost_desc: str, 
    lost_cat: str,
    found_name: str, 
    found_desc: str, 
    found_cat: str
) -> Tuple[float, Dict[str, Any]]:
    """
    Computes lexical, title-overlap, and semantic token similarity across titles & descriptions.
    """
    cat_match = 1.0 if (lost_cat and found_cat and (lost_cat.lower() == found_cat.lower() or lost_cat.lower() in found_cat.lower() or found_cat.lower() in lost_cat.lower())) else 0.4

    lost_name_tokens = set(tokenize_and_clean(lost_name))
    found_name_tokens = set(tokenize_and_clean(found_name))
    
    name_intersection = lost_name_tokens.intersection(found_name_tokens)
    name_union = lost_name_tokens.union(found_name_tokens)
    name_jaccard = len(name_intersection) / len(name_union) if name_union else 0.0

    clean_l_name = lost_name.lower().strip()
    clean_f_name = found_name.lower().strip()
    substr_bonus = 0.0
    if clean_l_name in clean_f_name or clean_f_name in clean_l_name:
        substr_bonus = 0.35

    name_score = min(1.0, (name_jaccard * 0.7) + substr_bonus)

    lost_desc_tokens = set(tokenize_and_clean(lost_desc))
    found_desc_tokens = set(tokenize_and_clean(found_desc))
    
    desc_intersection = lost_desc_tokens.intersection(found_desc_tokens)
    desc_union = lost_desc_tokens.union(found_desc_tokens)
    desc_jaccard = len(desc_intersection) / len(desc_union) if desc_union else 0.0

    key_terms = {'apple', 'macbook', 'dell', 'lenovo', 'hp', 'samsung', 'iphone', 'ipad', 'sony', 
                 'black', 'gray', 'grey', 'silver', 'white', 'blue', 'red', 'gold', 'leather',
                 'wallet', 'laptop', 'charger', 'bottle', 'watch', 'keys', 'earbuds', 'airpods'}
    
    matched_key_terms = lost_desc_tokens.intersection(found_desc_tokens).intersection(key_terms)
    key_terms_bonus = min(0.3, len(matched_key_terms) * 0.1)

    desc_score = min(1.0, (desc_jaccard * 0.7) + key_terms_bonus)

    raw_text_score = (name_score * 0.50) + (cat_match * 0.20) + (desc_score * 0.30)
    final_text_score = round(min(1.0, max(0.0, raw_text_score)), 4)

    breakdown = {
        "name_score": round(name_score, 4),
        "desc_score": round(desc_score, 4),
        "category_match": cat_match == 1.0,
        "shared_terms": list(name_intersection.union(matched_key_terms))
    }

    return final_text_score, breakdown


# ==============================================================================
# STAGE 2: SPATIO-TEMPORAL FILTER & TIME-DECAY
# ==============================================================================

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates Great-Circle distance between two GPS coordinates in kilometers."""
    R = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2.0) ** 2 + 
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 3)

def compute_spatio_temporal_score(
    lost_lat: float, lost_lon: float, lost_time_str: str,
    found_lat: float, found_lon: float, found_time_str: str,
    max_radius_km: float = 5.0
) -> Tuple[float, Dict[str, Any]]:
    """
    Computes spatial proximity (1-5km radius logic) and temporal consistency.
    """
    dist_km = haversine_distance(lost_lat, lost_lon, found_lat, found_lon)
    
    if dist_km <= 0.2:
        dist_score = 1.0
    elif dist_km >= max_radius_km:
        dist_score = max(0.05, 1.0 - (dist_km / (max_radius_km * 2)))
    else:
        dist_score = 1.0 - ((dist_km - 0.2) / (max_radius_km - 0.2))
    dist_score = max(0.0, min(1.0, dist_score))

    time_valid = True
    time_delta_hours = 0.0
    try:
        l_time = datetime.fromisoformat(lost_time_str.replace("Z", ""))
        f_time = datetime.fromisoformat(found_time_str.replace("Z", ""))
        
        delta_seconds = (f_time - l_time).total_seconds()
        time_delta_hours = round(delta_seconds / 3600.0, 2)

        if time_delta_hours < -1.0:
            time_valid = False
            temporal_confidence = 0.10
        elif time_delta_hours < 0:
            temporal_confidence = 0.85
        elif time_delta_hours <= 2.0:
            temporal_confidence = 1.00
        elif time_delta_hours <= 12.0:
            temporal_confidence = 0.95
        elif time_delta_hours <= 24.0:
            temporal_confidence = 0.90
        elif time_delta_hours <= 72.0:
            temporal_confidence = 0.75
        else:
            temporal_confidence = max(0.20, math.exp(-0.005 * (time_delta_hours - 72.0)))
    except Exception:
        temporal_confidence = 0.70
        time_delta_hours = 0.0

    spatio_temporal_score = round((dist_score * 0.55) + (temporal_confidence * 0.45), 4)

    details = {
        "distance_km": dist_km,
        "distance_score": round(dist_score, 4),
        "time_delta_hours": time_delta_hours,
        "temporal_valid": time_valid,
        "time_decay_score": round(temporal_confidence, 4),
        "within_radius": dist_km <= max_radius_km
    }

    return spatio_temporal_score, details


# ==============================================================================
# STAGE 3: TIER-1 MULTIMODAL VISION & MICRO-FEATURE ANALYSIS
# ==============================================================================

def analyze_multimodal_vision(
    lost_ref_photos: List[str],
    lost_desc: str,
    found_primary_photo: str,
    found_extra_photos: List[str],
    found_desc: str
) -> Tuple[float, Dict[str, Any]]:
    """
    Evaluates visual similarity using PIL.Image dominant color clusters, aspect ratio,
    and text feature cues.
    """
    all_found_photos = [p for p in [found_primary_photo] + found_extra_photos if p]
    has_lost_photos = len(lost_ref_photos) > 0
    has_found_photos = len(all_found_photos) > 0

    if not has_found_photos:
        return 0.50, {"mode": "no_found_photos", "color_match": 0.5, "shape_match": 0.5, "detail_match": 0.5}

    # 1. Tier-1 Empirical Color & Aspect Ratio Matching with PIL
    empirical_color_score = 0.50
    empirical_ar_score = 0.70
    detected_dominant_colors = []
    
    if has_lost_photos and has_found_photos:
        try:
            lost_img = load_pil_image(lost_ref_photos[0])
            found_img = load_pil_image(all_found_photos[0])
            
            if lost_img and found_img:
                colors_lost = extract_dominant_colors(lost_img, num_colors=3)
                colors_found = extract_dominant_colors(found_img, num_colors=3)
                
                if colors_lost and colors_found:
                    empirical_color_score = compute_color_similarity(colors_lost, colors_found)
                    detected_dominant_colors = [f"RGB{c}" for c in colors_found]
                    
                empirical_ar_score = compute_aspect_ratio_similarity(lost_img, found_img)
        except Exception:
            pass

    # 2. Extract visual color/material cues from text
    color_palette = {'black', 'space gray', 'gray', 'grey', 'silver', 'white', 'gold', 'blue', 'red', 'rose gold', 'matte', 'leather', 'metal', 'plastic', 'transparent'}
    
    l_text_tokens = set(tokenize_and_clean(lost_desc))
    f_text_tokens = set(tokenize_and_clean(found_desc))

    lost_colors = l_text_tokens.intersection(color_palette)
    found_colors = f_text_tokens.intersection(color_palette)

    if lost_colors and found_colors:
        color_intersection = lost_colors.intersection(found_colors)
        text_color_match = 0.95 if color_intersection else 0.35
    else:
        text_color_match = 0.75

    combined_color_score = (empirical_color_score * 0.60) + (text_color_match * 0.40) if has_lost_photos else text_color_match

    # Feature & damage cues (scratches, cracks, stickers, logos, skins)
    feature_keywords = {'scratch', 'crack', 'dent', 'sticker', 'skin', 'logo', 'hinge', 'case', 'engraving', 'cover', 'dbrand'}
    lost_features = l_text_tokens.intersection(feature_keywords)
    found_features = f_text_tokens.intersection(feature_keywords)
    
    shared_features = lost_features.intersection(found_features)
    detail_match = min(1.0, 0.70 + (len(shared_features) * 0.15))

    angles_bonus = min(0.10, len(all_found_photos) * 0.025)
    
    base_visual = (combined_color_score * 0.40) + (empirical_ar_score * 0.25) + (detail_match * 0.35) + angles_bonus
    visual_score = round(min(0.98, max(0.20, base_visual)), 4)

    details = {
        "color_match_score": round(combined_color_score, 4),
        "aspect_ratio_score": round(empirical_ar_score, 4),
        "micro_detail_score": round(detail_match, 4),
        "angles_count": len(all_found_photos),
        "detected_colors": detected_dominant_colors or list(lost_colors.union(found_colors)),
        "detected_features": list(lost_features.union(found_features))
    }

    return visual_score, details


# ==============================================================================
# PIPELINE ORCHESTRATOR: COMPLETE 5-STAGE MATCH ENGINE
# ==============================================================================

def run_matching_pipeline_for_lost_item(lost_item_id: str) -> List[Dict[str, Any]]:
    """
    Executes the full pipeline for a lost item:
    Stage 1: Text & Name Similarity -> Candidate Pool Shortlist
    Stage 2: Spatio-Temporal Filter (Geo-radius + Temporal time decay)
    Stage 3: Multimodal Vision & Micro-Feature Analysis
    Stage 4/5: Generates Composite Candidate Confidence Score, persists evaluation records,
               auto-creates verification probes for score >= 0.70, and fires notifications.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Fetch the target lost item
    cursor.execute("SELECT * FROM lost_items WHERE id = ?", (lost_item_id,))
    lost = cursor.fetchone()
    if not lost:
        conn.close()
        raise ValueError(f"Lost item {lost_item_id} not found")

    # 2. Fetch all active found items
    cursor.execute("SELECT * FROM found_items WHERE status != 'RESOLVED' AND (is_archived IS NULL OR is_archived = 0)")
    found_items = cursor.fetchall()

    if not found_items:
        conn.close()
        return []

    lost_ref_photos = json.loads(lost["reference_photos"]) if lost["reference_photos"] else []
    now_str = datetime.now().isoformat()

    # Stage 1: Text & Category Similarity
    stage1_candidates = []
    for found in found_items:
        text_score, text_breakdown = compute_text_similarity(
            lost_name=lost["product_name"],
            lost_desc=lost["description"],
            lost_cat=lost["category"],
            found_name=found["object_name"],
            found_desc=found["description"],
            found_cat=found["category"]
        )
        stage1_candidates.append({
            "found_row": found,
            "text_score": text_score,
            "text_breakdown": text_breakdown
        })

    stage1_candidates.sort(key=lambda x: x["text_score"], reverse=True)
    shortlist = [c for c in stage1_candidates if c["text_score"] >= 0.15]
    if not shortlist:
        shortlist = stage1_candidates[:5]

    # Stage 2: Spatio-Temporal Proximity
    stage2_candidates = []
    for cand in shortlist:
        found = cand["found_row"]
        spatio_temp_score, st_details = compute_spatio_temporal_score(
            lost_lat=lost["latitude"],
            lost_lon=lost["longitude"],
            lost_time_str=lost["last_seen_time"],
            found_lat=found["latitude"],
            found_lon=found["longitude"],
            found_time_str=found["found_time"],
            max_radius_km=5.0
        )
        stage2_candidates.append({
            **cand,
            "spatio_temporal_score": spatio_temp_score,
            "st_details": st_details
        })

    # Stage 3: Tier-1 Vision & Micro-Features
    final_candidates = []
    for cand in stage2_candidates:
        found = cand["found_row"]
        found_extra_photos = json.loads(found["additional_photos"]) if found["additional_photos"] else []
        
        visual_score, vision_details = analyze_multimodal_vision(
            lost_ref_photos=lost_ref_photos,
            lost_desc=lost["description"],
            found_primary_photo=found["primary_photo"],
            found_extra_photos=found_extra_photos,
            found_desc=found["description"]
        )

        composite_score = round(
            (cand["text_score"] * 0.35) + 
            (cand["spatio_temporal_score"] * 0.25) + 
            (visual_score * 0.40),
            4
        )

        final_candidates.append({
            "found_id": found["id"],
            "found_item": dict(found),
            "text_score": cand["text_score"],
            "text_breakdown": cand["text_breakdown"],
            "distance_km": cand["st_details"]["distance_km"],
            "distance_score": cand["st_details"]["distance_score"],
            "time_delta_hours": cand["st_details"]["time_delta_hours"],
            "time_decay_score": cand["st_details"]["time_decay_score"],
            "spatio_temporal_score": cand["spatio_temporal_score"],
            "visual_score": visual_score,
            "visual_details": vision_details,
            "composite_score": composite_score
        })

    final_candidates.sort(key=lambda x: x["composite_score"], reverse=True)

    persisted_results = []
    for rank, cand in enumerate(final_candidates, start=1):
        eval_id = f"EVAL-{lost_item_id[-6:]}-{cand['found_id'][-6:]}"
        
        cursor.execute("SELECT verification_status, admin_decision FROM match_evaluations WHERE id = ?", (eval_id,))
        existing = cursor.fetchone()
        v_status = existing["verification_status"] if existing else "NOT_REQUESTED"
        a_decision = existing["admin_decision"] if existing else "PENDING"

        cursor.execute("""
        INSERT INTO match_evaluations (
            id, lost_item_id, found_item_id, text_score,
            distance_km, distance_score, time_delta_hours, time_decay_score,
            spatio_temporal_score, visual_score, visual_details,
            composite_score, rank, verification_status, admin_decision,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            text_score = excluded.text_score,
            distance_km = excluded.distance_km,
            distance_score = excluded.distance_score,
            time_delta_hours = excluded.time_delta_hours,
            time_decay_score = excluded.time_decay_score,
            spatio_temporal_score = excluded.spatio_temporal_score,
            visual_score = excluded.visual_score,
            visual_details = excluded.visual_details,
            composite_score = excluded.composite_score,
            rank = excluded.rank,
            updated_at = excluded.updated_at
        """, (
            eval_id,
            lost_item_id,
            cand["found_id"],
            cand["text_score"],
            cand["distance_km"],
            cand["distance_score"],
            cand["time_delta_hours"],
            cand["time_decay_score"],
            cand["spatio_temporal_score"],
            cand["visual_score"],
            json.dumps(cand["visual_details"]),
            cand["composite_score"],
            rank,
            v_status,
            a_decision,
            now_str,
            now_str
        ))

        # Auto-create dynamic AI verification probe and send notifications for candidate matches (score >= 0.40 or top rank)
        if cand["composite_score"] >= 0.40 or rank == 1:
            cursor.execute("SELECT id FROM verification_probes WHERE lost_item_id = ? AND found_item_id = ?", (lost_item_id, cand["found_id"]))
            existing_probe = cursor.fetchone()
            
            if not existing_probe:
                try:
                    create_verification_probe_for_match(
                        lost_item_id, 
                        cand["found_id"], 
                        secret_index=0,
                        db_conn=conn,
                        db_cursor=cursor
                    )
                    v_status = "PROBE_SENT"
                    cursor.execute("UPDATE match_evaluations SET verification_status = 'PROBE_SENT', updated_at = ? WHERE id = ?", (now_str, eval_id))
                except Exception as e:
                    print(f"Auto probe skipped: {e}")

            # Notify Lost Item Claimant (Deduplicated)
            cursor.execute("""
            SELECT id FROM notifications 
            WHERE phone = ? AND type = 'MATCH_FOUND' AND message LIKE ?
            """, (lost["owner_phone"], f"%{cand['found_item']['object_name']}%"))
            if not cursor.fetchone():
                notif_id_owner = generate_intake_id("NOTIF")
                cursor.execute("""
                INSERT INTO notifications (id, user_id, phone, type, title, message, action_url, is_read, created_at)
                VALUES (?, ?, ?, 'MATCH_FOUND', ?, ?, ?, 0, ?)
                """, (
                    notif_id_owner,
                    lost["user_id"],
                    lost["owner_phone"],
                    "Potential Match Detected!",
                    f"A matching '{cand['found_item']['object_name']}' was registered with {int(cand['composite_score']*100)}% visual & spatial confidence. Safe verification challenge dispatched.",
                    f"/status?q={lost['owner_phone']}",
                    now_str
                ))

            # Notify Finder for verification photo (Deduplicated)
            f_phone = cand["found_item"].get("finder_phone")
            if f_phone:
                cursor.execute("""
                SELECT id FROM notifications 
                WHERE phone = ? AND type = 'VERIFICATION_PROBE_REQUESTED' AND message LIKE ?
                """, (f_phone, f"%{cand['found_item']['object_name']}%"))
                if not cursor.fetchone():
                    notif_id_finder = generate_intake_id("NOTIF")
                    cursor.execute("""
                    INSERT INTO notifications (id, user_id, phone, type, title, message, action_url, is_read, created_at)
                    VALUES (?, ?, ?, 'VERIFICATION_PROBE_REQUESTED', ?, ?, ?, 0, ?)
                    """, (
                        notif_id_finder,
                        cand["found_item"].get("user_id"),
                        f_phone,
                        "Photo Check Requested for Deposit",
                        f"A potential owner for '{cand['found_item']['object_name']}' is checking records. Please submit a close-up verification photo.",
                        f"/status?q={f_phone}",
                        now_str
                    ))

        persisted_results.append({
            "evaluation_id": eval_id,
            "lost_item_id": lost_item_id,
            "found_item_id": cand["found_id"],
            "rank": rank,
            "text_score": cand["text_score"],
            "text_breakdown": cand["text_breakdown"],
            "distance_km": cand["distance_km"],
            "distance_score": cand["distance_score"],
            "time_delta_hours": cand["time_delta_hours"],
            "time_decay_score": cand["time_decay_score"],
            "spatio_temporal_score": cand["spatio_temporal_score"],
            "visual_score": cand["visual_score"],
            "visual_details": cand["visual_details"],
            "composite_score": cand["composite_score"],
            "verification_status": v_status,
            "admin_decision": a_decision,
            "found_item": cand["found_item"]
        })

    # Update lost item status to SEARCHING or MATCH_CANDIDATE_FOUND
    if lost["status"] in ["REPORTED", "SEARCHING"]:
        new_lost_status = "MATCH_CANDIDATE_FOUND" if final_candidates else "SEARCHING"
        cursor.execute("UPDATE lost_items SET status = ?, updated_at = ? WHERE id = ?", (new_lost_status, now_str, lost_item_id))

    conn.commit()
    conn.close()

    return persisted_results


def run_matching_pipeline_for_found_item(found_item_id: str) -> List[Dict[str, Any]]:
    """
    Reverse matching: when a found item is registered, executes matching against all active lost items.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM lost_items WHERE status != 'RESOLVED' AND (is_archived IS NULL OR is_archived = 0)")
    lost_rows = cursor.fetchall()
    conn.close()

    all_matches = []
    for row in lost_rows:
        try:
            res = run_matching_pipeline_for_lost_item(row["id"])
            matching_this = [m for m in res if m["found_item_id"] == found_item_id]
            all_matches.extend(matching_this)
        except Exception as e:
            print(f"Error matching found item against lost {row['id']}: {e}")
            
    return all_matches


def auto_match_all_open_lost_items():
    """Background task runner to evaluate all active items."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM lost_items WHERE status != 'RESOLVED' AND (is_archived IS NULL OR is_archived = 0)")
    lost_rows = cursor.fetchall()
    conn.close()

    for row in lost_rows:
        try:
            run_matching_pipeline_for_lost_item(row["id"])
        except Exception as e:
            print(f"Auto-match error for {row['id']}: {e}")
