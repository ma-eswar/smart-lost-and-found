import json
from fastapi import APIRouter, HTTPException, BackgroundTasks
from datetime import datetime
from app.database import get_db_connection
from app.schemas import FoundItemDeskCreate, FoundItemDirectCreate, FoundItemResponse, UserResponse
from app.security import generate_access_token, generate_intake_id, hash_password, create_access_token, normalize_phone
from app.services.matching_pipeline import run_matching_pipeline_for_lost_item, run_matching_pipeline_for_found_item
from app.services.storage import save_base64_image

router = APIRouter(prefix="/api/found-items", tags=["Found Items"])


def auto_match_for_new_found_item(found_id: str):
    try:
        run_matching_pipeline_for_found_item(found_id)
    except Exception as exc:
        print(f"Auto-match error for found item {found_id}: {exc}")


@router.post("/desk", response_model=FoundItemResponse)
def create_desk_found_item(payload: FoundItemDeskCreate, background_tasks: BackgroundTasks):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check verified desk
    cursor.execute("SELECT * FROM verified_desks WHERE id = ?", (payload.desk_id,))
    desk = cursor.fetchone()
    if not desk:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid verified desk selected")
        
    item_id = generate_intake_id("FND")
    receipt_id = generate_intake_id("RCPT")
    access_token = generate_access_token()
    now_str = datetime.now().isoformat()
    
    # Save primary photo
    saved_primary_photo = save_base64_image(payload.primary_photo)
    
    # Save additional photos
    saved_additional_photos = []
    for photo in payload.additional_photos:
        if photo:
            saved_additional_photos.append(save_base64_image(photo))
            
    found_loc = payload.found_location or desk["name"]
    lat = payload.latitude if payload.latitude is not None else desk["latitude"]
    lon = payload.longitude if payload.longitude is not None else desk["longitude"]
    found_time = payload.found_time or now_str
    
    is_verified_samaritan = bool(payload.finder_roll_or_id and len(payload.finder_roll_or_id.strip()) > 0)
    
    # Resolve or auto-create user account
    user_id = payload.user_id
    email_clean = payload.finder_email.strip().lower()
    raw_phone = payload.finder_phone.strip()
    norm_phone = normalize_phone(raw_phone)
    
    cursor.execute("SELECT id, full_name, email, phone, role, created_at FROM users WHERE phone = ? OR phone LIKE ? OR lower(email) = ?", (raw_phone, f"%{norm_phone}%" if norm_phone else raw_phone, email_clean))
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
        """, (user_id, payload.finder_name.strip(), email_clean, raw_phone, pwd_hash, now_str))
        user_obj = UserResponse(
            id=user_id,
            full_name=payload.finder_name.strip(),
            email=email_clean,
            phone=raw_phone,
            role="user",
            created_at=now_str
        )
        
    auth_token = create_access_token({"sub": user_id, "email": email_clean, "name": payload.finder_name.strip()})

    # Overwrite state: Archive prior active listings for same phone/user & identical object name
    cursor.execute("""
    SELECT id FROM found_items 
    WHERE (finder_phone = ? OR finder_phone LIKE ? OR user_id = ?) 
      AND lower(object_name) = lower(?)
      AND status NOT IN ('RESOLVED', 'ARCHIVED')
    """, (raw_phone, f"%{norm_phone}%" if norm_phone else raw_phone, user_id, payload.object_name.strip()))
    old_found_rows = cursor.fetchall()
    
    for old_r in old_found_rows:
        old_id = old_r["id"]
        cursor.execute("UPDATE found_items SET status = 'ARCHIVED', is_archived = 1, updated_at = ? WHERE id = ?", (now_str, old_id))
        cursor.execute("DELETE FROM match_evaluations WHERE found_item_id = ?", (old_id,))
        cursor.execute("DELETE FROM verification_probes WHERE found_item_id = ?", (old_id,))

    cursor.execute("""
    INSERT INTO found_items (
        id, user_id, submission_type, desk_id, desk_intake_receipt_id,
        object_name, category, description, primary_photo, additional_photos,
        found_location, latitude, longitude, found_time,
        pickup_availability, finder_name, finder_phone, finder_phone_verified,
        finder_email, finder_upi_id, finder_roll_or_id, is_verified_samaritan,
        status, access_token, created_at, updated_at
    ) VALUES (
        ?, ?, 'VERIFIED_DESK', ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, 1,
        ?, ?, ?, ?,
        'INTAKE_RECEIVED', ?, ?, ?
    )
    """, (
        item_id,
        user_id,
        payload.desk_id,
        receipt_id,
        payload.object_name.strip(),
        payload.category.strip(),
        payload.description.strip(),
        saved_primary_photo,
        json.dumps(saved_additional_photos),
        found_loc,
        float(lat),
        float(lon),
        found_time,
        f"Safely Deposited at {desk['name']}",
        payload.finder_name.strip(),
        payload.finder_phone.strip(),
        payload.finder_email.strip(),
        payload.finder_upi_id.strip(),
        payload.finder_roll_or_id.strip() if payload.finder_roll_or_id else None,
        1 if is_verified_samaritan else 0,
        access_token,
        now_str,
        now_str
    ))
    
    conn.commit()
    conn.close()

    background_tasks.add_task(auto_match_for_new_found_item, item_id)
    
    return FoundItemResponse(
        id=item_id,
        submission_type="VERIFIED_DESK",
        desk_id=payload.desk_id,
        desk_intake_receipt_id=receipt_id,
        object_name=payload.object_name,
        category=payload.category,
        description=payload.description,
        primary_photo=saved_primary_photo,
        additional_photos=saved_additional_photos,
        found_location=found_loc,
        latitude=float(lat),
        longitude=float(lon),
        found_time=found_time,
        pickup_availability=f"Safely Deposited at {desk['name']}",
        finder_name=payload.finder_name,
        finder_phone=payload.finder_phone,
        finder_email=payload.finder_email,
        finder_upi_id=payload.finder_upi_id,
        is_verified_samaritan=is_verified_samaritan,
        status="INTAKE_RECEIVED",
        access_token=access_token,
        created_at=now_str,
        auth_token=auth_token,
        user=user_obj
    )

@router.post("/direct", response_model=FoundItemResponse)
def create_direct_found_item(payload: FoundItemDirectCreate, background_tasks: BackgroundTasks):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    item_id = generate_intake_id("FND")
    access_token = generate_access_token()
    now_str = datetime.now().isoformat()
    
    # Save mandatory primary photo
    saved_primary_photo = save_base64_image(payload.primary_photo)
    
    # Save up to 4 additional photos
    saved_additional_photos = []
    for photo in payload.additional_photos:
        if photo:
            saved_additional_photos.append(save_base64_image(photo))
            
    is_verified_samaritan = bool(payload.finder_roll_or_id and len(payload.finder_roll_or_id.strip()) > 0)
    
    # Resolve or auto-create user account
    user_id = payload.user_id
    email_clean = payload.finder_email.strip().lower()
    raw_phone = payload.finder_phone.strip()
    norm_phone = normalize_phone(raw_phone)
    
    cursor.execute("SELECT id, full_name, email, phone, role, created_at FROM users WHERE phone = ? OR phone LIKE ? OR lower(email) = ?", (raw_phone, f"%{norm_phone}%" if norm_phone else raw_phone, email_clean))
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
        """, (user_id, payload.finder_name.strip(), email_clean, raw_phone, pwd_hash, now_str))
        user_obj = UserResponse(
            id=user_id,
            full_name=payload.finder_name.strip(),
            email=email_clean,
            phone=raw_phone,
            role="user",
            created_at=now_str
        )
        
    auth_token = create_access_token({"sub": user_id, "email": email_clean, "name": payload.finder_name.strip()})

    # Overwrite state: Archive prior active listings for same phone/user & identical object name
    cursor.execute("""
    SELECT id FROM found_items 
    WHERE (finder_phone = ? OR finder_phone LIKE ? OR user_id = ?) 
      AND lower(object_name) = lower(?)
      AND status NOT IN ('RESOLVED', 'ARCHIVED')
    """, (raw_phone, f"%{norm_phone}%" if norm_phone else raw_phone, user_id, payload.object_name.strip()))
    old_found_rows = cursor.fetchall()
    
    for old_r in old_found_rows:
        old_id = old_r["id"]
        cursor.execute("UPDATE found_items SET status = 'ARCHIVED', is_archived = 1, updated_at = ? WHERE id = ?", (now_str, old_id))
        cursor.execute("DELETE FROM match_evaluations WHERE found_item_id = ?", (old_id,))
        cursor.execute("DELETE FROM verification_probes WHERE found_item_id = ?", (old_id,))

    cursor.execute("""
    INSERT INTO found_items (
        id, user_id, submission_type, desk_id, desk_intake_receipt_id,
        object_name, category, description, primary_photo, additional_photos,
        found_location, latitude, longitude, found_time,
        pickup_availability, finder_name, finder_phone, finder_phone_verified,
        finder_email, finder_upi_id, finder_roll_or_id, is_verified_samaritan,
        status, access_token, created_at, updated_at
    ) VALUES (
        ?, ?, 'DIRECT_CUSTODY', NULL, NULL,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, 1,
        ?, ?, ?, ?,
        'IN_CUSTODY', ?, ?, ?
    )
    """, (
        item_id,
        user_id,
        payload.object_name.strip(),
        payload.category.strip(),
        payload.description.strip(),
        saved_primary_photo,
        json.dumps(saved_additional_photos),
        payload.found_location.strip(),
        float(payload.latitude),
        float(payload.longitude),
        payload.found_time,
        payload.pickup_availability.strip(),
        payload.finder_name.strip(),
        payload.finder_phone.strip(),
        payload.finder_email.strip(),
        payload.finder_upi_id.strip(),
        payload.finder_roll_or_id.strip() if payload.finder_roll_or_id else None,
        1 if is_verified_samaritan else 0,
        access_token,
        now_str,
        now_str
    ))
    
    conn.commit()
    conn.close()

    background_tasks.add_task(auto_match_for_new_found_item, item_id)
    
    return FoundItemResponse(
        id=item_id,
        submission_type="DIRECT_CUSTODY",
        desk_id=None,
        desk_intake_receipt_id=None,
        object_name=payload.object_name,
        category=payload.category,
        description=payload.description,
        primary_photo=saved_primary_photo,
        additional_photos=saved_additional_photos,
        found_location=payload.found_location,
        latitude=float(payload.latitude),
        longitude=float(payload.longitude),
        found_time=payload.found_time,
        pickup_availability=payload.pickup_availability,
        finder_name=payload.finder_name,
        finder_phone=payload.finder_phone,
        finder_email=payload.finder_email,
        finder_upi_id=payload.finder_upi_id,
        is_verified_samaritan=is_verified_samaritan,
        status="IN_CUSTODY",
        access_token=access_token,
        created_at=now_str,
        auth_token=auth_token,
        user=user_obj
    )
