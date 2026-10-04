from fastapi import APIRouter, HTTPException
from typing import List
from app.database import get_db_connection
from app.schemas import VerifiedDeskResponse

router = APIRouter(prefix="/api/desks", tags=["Verified Desks"])

@router.get("", response_model=List[VerifiedDeskResponse])
def get_verified_desks():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM verified_desks WHERE is_active = 1")
    rows = cursor.fetchall()
    conn.close()
    
    return [
        VerifiedDeskResponse(
            id=row["id"],
            name=row["name"],
            building_or_zone=row["building_or_zone"],
            address=row["address"],
            operating_hours=row["operating_hours"],
            officer_on_duty=row["officer_on_duty"],
            contact_phone=row["contact_phone"],
            latitude=row["latitude"],
            longitude=row["longitude"],
            is_active=bool(row["is_active"])
        )
        for row in rows
    ]

@router.get("/{desk_id}", response_model=VerifiedDeskResponse)
def get_desk_details(desk_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM verified_desks WHERE id = ?", (desk_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Desk not found")
        
    return VerifiedDeskResponse(
        id=row["id"],
        name=row["name"],
        building_or_zone=row["building_or_zone"],
        address=row["address"],
        operating_hours=row["operating_hours"],
        officer_on_duty=row["officer_on_duty"],
        contact_phone=row["contact_phone"],
        latitude=row["latitude"],
        longitude=row["longitude"],
        is_active=bool(row["is_active"])
    )
