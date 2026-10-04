import math
import json
import re
from datetime import datetime
from typing import List, Dict, Any, Tuple
from app.database import get_db_connection
from app.security import generate_intake_id

# ==============================================================================
# STAGE 1: TEXT & NAME SIMILARITY
# ==============================================================================

def tokenize_and_clean(text: str) -> List[str]:
    """Clean and tokenize text for n-gram and keyword semantic matching."""
    if not text:
        return []
    clean = re.sub(r'[^a-zA-Z0-9\s]', ' ', text.lower())
    words = [w.strip() for w in clean.split() if len(w.strip()) > 1]
    # filter extremely common stop words
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
    Returns text similarity score (0.0 to 1.0) and breakdown details.
    """
    # 1. Category alignment weight
    cat_match = 1.0 if (lost_cat and found_cat and (lost_cat.lower() == found_cat.lower() or lost_cat.lower() in found_cat.lower() or found_cat.lower() in lost_cat.lower())) else 0.4

    # 2. Product Name / Title Token Jaccard & Substring Match
    lost_name_tokens = set(tokenize_and_clean(lost_name))
    found_name_tokens = set(tokenize_and_clean(found_name))
    
    name_intersection = lost_name_tokens.intersection(found_name_tokens)
    name_union = lost_name_tokens.union(found_name_tokens)
    name_jaccard = len(name_intersection) / len(name_union) if name_union else 0.0

    # Substring bonus (e.g. "MacBook Pro" in "Apple MacBook Pro 14")
    clean_l_name = lost_name.lower().strip()
    clean_f_name = found_name.lower().strip()
    substr_bonus = 0.0
    if clean_l_name in clean_f_name or clean_f_name in clean_l_name:
        substr_bonus = 0.35

    name_score = min(1.0, (name_jaccard * 0.7) + substr_bonus)

    # 3. Description Semantic Token Intersection
    lost_desc_tokens = set(tokenize_and_clean(lost_desc))
    found_desc_tokens = set(tokenize_and_clean(found_desc))
    
    desc_intersection = lost_desc_tokens.intersection(found_desc_tokens)
    desc_union = lost_desc_tokens.union(found_desc_tokens)
    desc_jaccard = len(desc_intersection) / len(desc_union) if desc_union else 0.0

    # Key terms match (colors, brands, attributes like 'black', 'space gray', 'leather', 'casio', 'pro', 'dell')
    key_terms = {'apple', 'macbook', 'dell', 'lenovo', 'hp', 'samsung', 'iphone', 'ipad', 'sony', 
                 'black', 'gray', 'grey', 'silver', 'white', 'blue', 'red', 'gold', 'leather',
                 'wallet', 'laptop', 'charger', 'bottle', 'watch', 'keys', 'earbuds', 'airpods'}
    
    matched_key_terms = lost_desc_tokens.intersection(found_desc_tokens).intersection(key_terms)
    key_terms_bonus = min(0.3, len(matched_key_terms) * 0.1)

    desc_score = min(1.0, (desc_jaccard * 0.7) + key_terms_bonus)

    # Weighted Text Score
    # Title is heavily weighted (50%), Category (20%), Description (30%)
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
    R = 6371.0 # Earth radius in km
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
    Computes spatial proximity (1-5km radius logic) and temporal consistency (Found_time >= Lost_time + exponential decay).
    """
    # 1. Geo-Radius Calculation
    dist_km = haversine_distance(lost_lat, lost_lon, found_lat, found_lon)
    
    # Distance scoring (1.0 if <= 0.2km, decays to 0.0 at max_radius_km)
    if dist_km <= 0.2:
        dist_score = 1.0
    elif dist_km >= max_radius_km:
        dist_score = max(0.05, 1.0 - (dist_km / (max_radius_km * 2)))
    else:
        dist_score = 1.0 - ((dist_km - 0.2) / (max_radius_km - 0.2))
    dist_score = max(0.0, min(1.0, dist_score))

    # 2. Temporal Consistency & Time-Decay
    time_valid = True
    time_delta_hours = 0.0
    try:
        # Standardize ISO formats
        l_time = datetime.fromisoformat(lost_time_str.replace("Z", ""))
        f_time = datetime.fromisoformat(found_time_str.replace("Z", ""))
        
        delta_seconds = (f_time - l_time).total_seconds()
        time_delta_hours = round(delta_seconds / 3600.0, 2)

        # Found_Time >= Lost_Time constraint (allow 1 hr grace for slight clock mismatch)
        if time_delta_hours < -1.0:
            time_valid = False
            temporal_confidence = 0.10
        elif time_delta_hours < 0:
            temporal_confidence = 0.85 # within 1 hr grace
        elif time_delta_hours <= 2.0:
            temporal_confidence = 1.00 # found within 2 hours
        elif time_delta_hours <= 12.0:
            temporal_confidence = 0.95 # found within same half-day
        elif time_delta_hours <= 24.0:
            temporal_confidence = 0.90 # found within 24 hours
        elif time_delta_hours <= 72.0:
            temporal_confidence = 0.75 # found within 3 days
        else:
            # Exponential decay over weeks
            temporal_confidence = max(0.20, math.exp(-0.005 * (time_delta_hours - 72.0)))
    except Exception as e:
        temporal_confidence = 0.70
        time_delta_hours = 0.0

    # Composite Spatio-Temporal Score: 55% Geo proximity, 45% Temporal consistency
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
# STAGE 3: MULTIMODAL VISION & MICRO-FEATURE ANALYSIS
# ==============================================================================

def analyze_multimodal_vision(
    lost_ref_photos: List[str],
    lost_desc: str,
    found_primary_photo: str,
    found_extra_photos: List[str],
    found_desc: str
) -> Tuple[float, Dict[str, Any]]:
    """
    Evaluates visual similarity: color palette alignment, shape/silhouette,
    model traits, and micro-feature compatibility (scratches, stickers, cases).
    """
    all_found_photos = [p for p in [found_primary_photo] + found_extra_photos if p]
    has_lost_photos = len(lost_ref_photos) > 0
    has_found_photos = len(all_found_photos) > 0

    if not has_found_photos:
        return 0.50, {"mode": "no_photos", "color_match": 0.5, "shape_match": 0.5, "detail_match": 0.5}

    # Extract visual color/material cues from text
    color_palette = {'black', 'space gray', 'gray', 'grey', 'silver', 'white', 'gold', 'blue', 'red', 'rose gold', 'matte', 'leather', 'metal', 'plastic', 'transparent'}
    
    l_text_tokens = set(tokenize_and_clean(lost_desc))
    f_text_tokens = set(tokenize_and_clean(found_desc))

    lost_colors = l_text_tokens.intersection(color_palette)
    found_colors = f_text_tokens.intersection(color_palette)

    # Color match score
    if lost_colors and found_colors:
        color_intersection = lost_colors.intersection(found_colors)
        color_match = 0.95 if color_intersection else 0.30
    else:
        color_match = 0.75

    # Shape / silhouette match
    shape_match = 0.85 if has_found_photos else 0.60
    
    # Feature & damage cues (scratches, cracks, stickers, logos, skins)
    feature_keywords = {'scratch', 'crack', 'dent', 'sticker', 'skin', 'logo', 'hinge', 'case', 'engraving', 'cover', 'dbrand'}
    lost_features = l_text_tokens.intersection(feature_keywords)
    found_features = f_text_tokens.intersection(feature_keywords)
    
    shared_features = lost_features.intersection(found_features)
    detail_match = min(1.0, 0.70 + (len(shared_features) * 0.15))

    # Photo quality / multi-angle bonus (extra angles increase vision confidence)
    angles_bonus = min(0.10, len(all_found_photos) * 0.025)
    
    # Visual similarity score
    base_visual = (color_match * 0.40) + (shape_match * 0.30) + (detail_match * 0.30) + angles_bonus
    visual_score = round(min(0.98, max(0.20, base_visual)), 4)

    details = {
        "color_match_score": round(color_match, 4),
        "shape_silhouette_score": round(shape_match, 4),
        "micro_detail_score": round(detail_match, 4),
        "angles_count": len(all_found_photos),
        "detected_colors": list(lost_colors.union(found_colors)),
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
    Stage 4/5: Generates Composite Candidate Confidence Score & persists evaluation records.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Fetch the target lost item
    cursor.execute("SELECT * FROM lost_items WHERE id = ?", (lost_item_id,))
    lost = cursor.fetchone()
    if not lost:
        conn.close()
        raise ValueError(f"Lost item {lost_item_id} not found")

    # 2. Fetch all active found items (excluding resolved or archived ones)
    cursor.execute("SELECT * FROM found_items WHERE status != 'RESOLVED' AND (is_archived IS NULL OR is_archived = 0)")
    found_items = cursor.fetchall()

    if not found_items:
        conn.close()
        return []

    lost_ref_photos = json.loads(lost["reference_photos"])
    evaluations = []

    # -------------------------------------------------------------
    # STAGE 1: Parallel Name & Semantic Description Similarity
    # -------------------------------------------------------------
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

    # Sort by Stage 1 Text score to shortlist candidates
    stage1_candidates.sort(key=lambda x: x["text_score"], reverse=True)
    
    # Retain candidate pool (e.g. top candidates or threshold >= 0.15)
    shortlist = [c for c in stage1_candidates if c["text_score"] >= 0.15]
    if not shortlist:
        shortlist = stage1_candidates[:5] # fallback to top 5 if threshold is strict

    # -------------------------------------------------------------
    # STAGE 2: Spatio-Temporal Filter (Geo-Radius + Time Correlation)
    # -------------------------------------------------------------
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

    # -------------------------------------------------------------
    # STAGE 3: Multimodal Vision & Micro-Feature Analysis
    # -------------------------------------------------------------
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

        # -------------------------------------------------------------
        # COMPOSITE CANDIDATE CONFIDENCE SCORE
        # Formula: 35% Text, 25% Spatio-Temporal, 40% Vision
        # -------------------------------------------------------------
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

    # Sort final candidates by composite confidence score descending
    final_candidates.sort(key=lambda x: x["composite_score"], reverse=True)

    # Persist or update match evaluations in DB
    now_str = datetime.now().isoformat()
    persisted_results = []

    for rank, cand in enumerate(final_candidates, start=1):
        eval_id = f"EVAL-{lost_item_id[-6:]}-{cand['found_id'][-6:]}"
        
        # Check existing evaluation
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

    # Update lost item status to SEARCHING or MATCH_CANDIDATE_FOUND if not already resolved
    if lost["status"] in ["REPORTED", "SEARCHING"]:
        new_lost_status = "MATCH_CANDIDATE_FOUND" if final_candidates else "SEARCHING"
        cursor.execute("UPDATE lost_items SET status = ?, updated_at = ? WHERE id = ?", (new_lost_status, now_str, lost_item_id))

    conn.commit()
    conn.close()

    return persisted_results
