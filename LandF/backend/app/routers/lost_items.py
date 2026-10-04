import json
from fastapi import APIRouter, HTTPException, BackgroundTasks
from datetime import datetime
from app.database import get_db_connection
from app.schemas import LostItemCreate, LostItemResponse, UserResponse
from app.security import hash_identifier, get_last_4, generate_access_token, generate_intake_id, hash_password, create_access_token, normalize_phone
from app.services.matching_pipeline import run_matching_pipeline_for_lost_item
from app.services.storage import save_base64_image

router = APIRouter(prefix="/api/lost-items", tags=["Lost Items"])

@router.post("", response_model=LostItemResponse)
def create_lost_item(payload: LostItemCreate, background_tasks: BackgroundTasks):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    item_id = generate_intake_id("LOST")
    access_token = generate_access_token()
    now_str = datetime.now().isoformat()
    
    # Process reference photos
    saved_ref_photos = []
    for photo in payload.reference_photos:
        if photo:
            saved_ref_photos.append(save_base64_image(photo))
            
    # Process secret points (saving any attached secret photos)
    processed_secret_points = []
    for sp in payload.secret_points:
        photo_path = save_base64_image(sp.photo_url) if sp.photo_url else None
        processed_secret_points.append({
            "question": sp.question.strip() if sp.question else None,
            "point": sp.point.strip(),
            "photo_url": photo_path
        })
        
    govt_id_hash = hash_identifier(payload.institutional_id)
    govt_id_last4 = get_last_4(payload.institutional_id)
    
    escrow_status = "PLEDGED" if float(payload.reward_amount) > 0 else "NONE"
    
    # Resolve or auto-create User Account
    user_id = payload.user_id
    email_clean = payload.owner_email.strip().lower()
    raw_phone = payload.owner_phone.strip()
    norm_phone = normalize_phone(raw_phone)
    clean_10 = norm_phone[-10:] if len(norm_phone) >= 10 else norm_phone
    clean_pattern = f"%{clean_10}%" if clean_10 else raw_phone
    
    cursor.execute("""
    SELECT id, full_name, email, phone, role, created_at FROM users 
    WHERE phone = ? OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ? OR lower(email) = ?
    """, (raw_phone, clean_pattern, email_clean))
    user_row = cursor.fetchone()
    
    if user_row:
        user_id = user_row["id"]
        user_obj = UserResponse(
            id=user_row["id"],
            full_name=user_row["full_name"],
            email=user_row["email"],
            phone=user_row["phone"],
            role=user_row["role"],
            created_at=user_row["created_at"]
        )
    else:
        user_id = generate_intake_id("USER")
        pwd_raw = payload.password if payload.password else "123456"
        pwd_hash = hash_password(pwd_raw)
        cursor.execute("""
        INSERT INTO users (id, full_name, email, phone, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, ?, 'user', ?)
        """, (user_id, payload.owner_name.strip(), email_clean, raw_phone, pwd_hash, now_str))
        user_obj = UserResponse(
            id=user_id,
            full_name=payload.owner_name.strip(),
            email=email_clean,
            phone=raw_phone,
            role="user",
            created_at=now_str
        )
        
    auth_token = create_access_token({"sub": user_id, "email": email_clean, "name": payload.owner_name.strip()})

    # Overwrite state: Archive prior active listings for same phone/user & identical product name
    cursor.execute("""
    SELECT id FROM lost_items 
    WHERE (owner_phone = ? OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(owner_phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') LIKE ? OR user_id = ?) 
      AND lower(product_name) = lower(?)
      AND status NOT IN ('RESOLVED', 'ARCHIVED')
    """, (raw_phone, clean_pattern, user_id, payload.product_name.strip()))
    old_lost_rows = cursor.fetchall()
    
    for old_r in old_lost_rows:
        old_id = old_r["id"]
        cursor.execute("UPDATE lost_items SET status = 'ARCHIVED', is_archived = 1, updated_at = ? WHERE id = ?", (now_str, old_id))
        cursor.execute("DELETE FROM match_evaluations WHERE lost_item_id = ?", (old_id,))
        cursor.execute("DELETE FROM verification_probes WHERE lost_item_id = ?", (old_id,))
        cursor.execute("UPDATE release_authorizations SET is_used = 1 WHERE lost_item_id = ? AND is_used = 0", (old_id,))

    # Insert lost item
    cursor.execute("""
    INSERT INTO lost_items (
        id, user_id, product_name, category, description, reference_photos,
        secret_points, reward_amount, reward_currency, escrow_status,
        owner_name, owner_phone, owner_phone_verified, backup_contact,
        owner_email, residential_address, govt_id_hash, govt_id_last4,
        last_seen_location, latitude, longitude, last_seen_time,
        status, access_token, created_at, updated_at
    ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?
    )
    """, (
        item_id,
        user_id,
        payload.product_name.strip(),
        payload.category.strip(),
        payload.description.strip(),
        json.dumps(saved_ref_photos),
        json.dumps(processed_secret_points),
        float(payload.reward_amount),
        payload.reward_currency,
        escrow_status,
        payload.owner_name.strip(),
        payload.owner_phone.strip(),
        1,
        payload.backup_contact.strip(),
        payload.owner_email.strip(),
        payload.residential_address.strip(),
        govt_id_hash,
        govt_id_last4,
        payload.last_seen_location.strip(),
        float(payload.latitude),
        float(payload.longitude),
        payload.last_seen_time,
        "REPORTED",
        access_token,
        now_str,
        now_str
    ))
    
    # Create escrow record if reward pledged
    if payload.reward_amount > 0:
        escrow_id = generate_intake_id("ESC")
        cursor.execute("""
        INSERT INTO escrow_records (
            id, lost_item_id, found_item_id, amount, currency, status,
            payer_name, payer_phone, recipient_upi, transaction_ref,
            created_at, updated_at
        ) VALUES (?, ?, NULL, ?, ?, 'PLEDGED', ?, ?, NULL, ?, ?, ?)
        """, (
            escrow_id,
            item_id,
            float(payload.reward_amount),
            payload.reward_currency,
            payload.owner_name.strip(),
            payload.owner_phone.strip(),
            f"TXN-ESC-{item_id[-6:]}",
            now_str,
            now_str
        ))
        
    conn.commit()
    conn.close()

    background_tasks.add_task(run_matching_pipeline_for_lost_item, item_id)
    
    return LostItemResponse(
        id=item_id,
        product_name=payload.product_name,
        category=payload.category,
        description=payload.description,
        reference_photos=saved_ref_photos,
        reward_amount=float(payload.reward_amount),
        reward_currency=payload.reward_currency,
        escrow_status=escrow_status,
        owner_name=payload.owner_name,
        owner_phone=payload.owner_phone,
        backup_contact=payload.backup_contact,
        owner_email=payload.owner_email,
        residential_address=payload.residential_address,
        govt_id_last4=govt_id_last4,
        last_seen_location=payload.last_seen_location,
        latitude=float(payload.latitude),
        longitude=float(payload.longitude),
        last_seen_time=payload.last_seen_time,
        status="REPORTED",
        access_token=access_token,
        created_at=now_str,
        auth_token=auth_token,
        user=user_obj
    )

@router.get("/{item_id}")
def get_lost_item(item_id: str, token: str = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM lost_items WHERE id = ?", (item_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Lost item record not found")
        
    # Privacy protection: only reveal secrets if caller has the matching access token
    is_authorized_owner = (token and token == row["access_token"])
    
    res = {
        "id": row["id"],
        "product_name": row["product_name"],
        "category": row["category"],
        "description": row["description"],
        "reference_photos": json.loads(row["reference_photos"]),
        "reward_amount": row["reward_amount"],
        "reward_currency": row["reward_currency"],
        "escrow_status": row["escrow_status"],
        "last_seen_location": row["last_seen_location"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "last_seen_time": row["last_seen_time"],
        "status": row["status"],
        "created_at": row["created_at"]
    }
    
    if is_authorized_owner:
        res["owner_name"] = row["owner_name"]
        res["owner_phone"] = row["owner_phone"]
        res["backup_contact"] = row["backup_contact"]
        res["owner_email"] = row["owner_email"]
        res["residential_address"] = row["residential_address"]
        res["govt_id_last4"] = row["govt_id_last4"]
        res["secret_points"] = json.loads(row["secret_points"])
        res["access_token"] = row["access_token"]
        
    return res
