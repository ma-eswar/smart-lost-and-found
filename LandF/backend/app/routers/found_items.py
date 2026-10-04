import json
from fastapi import APIRouter, HTTPException, BackgroundTasks
from datetime import datetime
from app.database import get_db_connection
from app.schemas import FoundItemDeskCreate, FoundItemDirectCreate, FoundItemResponse
from app.security import generate_access_token, generate_intake_id
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
        payload.user_id,
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
        created_at=now_str
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
        payload.user_id,
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
        created_at=now_str
    )
