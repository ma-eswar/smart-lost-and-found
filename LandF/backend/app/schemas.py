from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime

# -------------------------------------------------------------
# User & Auth Schemas
# -------------------------------------------------------------
class UserRegister(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(..., min_length=7, max_length=20)
    password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    identifier: str = Field(..., min_length=3, description="Email or Phone Number")
    password: str = Field(..., min_length=1)

class UserResponse(BaseModel):
    id: str
    full_name: str
    email: str
    phone: str
    role: str
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# -------------------------------------------------------------
# Secret Point & Lost Item Schemas
# -------------------------------------------------------------
class SecretPoint(BaseModel):
    point: str = Field(..., min_length=2, description="Confirmation detail / answer only the owner knows")
    question: Optional[str] = Field(None, description="Identifying question or confirmation prompt")
    photo_url: Optional[str] = Field(None, description="Optional photo verifying this secret point")

class LostItemCreate(BaseModel):
    product_name: str = Field(..., min_length=2, max_length=150)
    category: str = Field(..., min_length=2)
    description: str = Field(..., min_length=10)
    reference_photos: List[str] = Field(default_factory=list)
    secret_points: List[SecretPoint] = Field(default_factory=list, max_length=3)
    reward_amount: float = Field(default=0.0, ge=0.0)
    reward_currency: str = Field(default="INR")
    owner_name: str = Field(..., min_length=2)
    owner_phone: str = Field(..., min_length=7, max_length=20)
    backup_contact: str = Field(..., min_length=5, description="Friend's phone or alternate email")
    owner_email: EmailStr
    residential_address: str = Field(..., min_length=5)
    institutional_id: str = Field(..., min_length=3, description="Institutional/Govt ID number")
    last_seen_location: str = Field(..., min_length=3)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    last_seen_time: str = Field(...)
    user_id: Optional[str] = None
    password: Optional[str] = None

class LostItemResponse(BaseModel):
    id: str
    product_name: str
    category: str
    description: str
    reference_photos: List[str]
    reward_amount: float
    reward_currency: str
    escrow_status: str
    owner_name: str
    owner_phone: str
    backup_contact: str
    owner_email: str
    residential_address: str
    govt_id_last4: str
    last_seen_location: str
    latitude: float
    longitude: float
    last_seen_time: str
    status: str
    access_token: str
    created_at: str
    auth_token: Optional[str] = None
    user: Optional[UserResponse] = None

# -------------------------------------------------------------
# Found Item Schemas (Dual Ingestion)
# -------------------------------------------------------------
class FoundItemDeskCreate(BaseModel):
    desk_id: str
    object_name: str = Field(..., min_length=2)
    category: str = Field(..., min_length=2)
    description: str = Field(..., min_length=5)
    primary_photo: str = Field(..., min_length=1)
    additional_photos: List[str] = Field(default_factory=list, max_length=4)
    finder_name: str = Field(..., min_length=2)
    finder_phone: str = Field(..., min_length=7)
    finder_email: EmailStr
    finder_upi_id: str = Field(..., min_length=4, description="UPI ID for escrow reward")
    finder_roll_or_id: Optional[str] = None
    found_location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    found_time: Optional[str] = None
    user_id: Optional[str] = None
    password: Optional[str] = None

class FoundItemDirectCreate(BaseModel):
    object_name: str = Field(..., min_length=2)
    category: str = Field(..., min_length=2)
    description: str = Field(..., min_length=5)
    primary_photo: str = Field(..., min_length=1, description="Mandatory primary photo")
    additional_photos: List[str] = Field(default_factory=list, max_length=4)
    found_location: str = Field(..., min_length=3)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    found_time: str = Field(...)
    pickup_availability: str = Field(..., min_length=3, description="Handover availability / preferred desk")
    finder_name: str = Field(..., min_length=2)
    finder_phone: str = Field(..., min_length=7)
    finder_email: EmailStr
    finder_upi_id: str = Field(..., min_length=4)
    finder_roll_or_id: Optional[str] = None
    user_id: Optional[str] = None
    password: Optional[str] = None

class FoundItemResponse(BaseModel):
    id: str
    submission_type: str
    desk_id: Optional[str]
    desk_intake_receipt_id: Optional[str]
    object_name: str
    category: str
    description: str
    primary_photo: str
    additional_photos: List[str]
    found_location: str
    latitude: float
    longitude: float
    found_time: str
    pickup_availability: str
    finder_name: str
    finder_phone: str
    finder_email: str
    finder_upi_id: str
    is_verified_samaritan: bool
    status: str
    access_token: str
    created_at: str
    auth_token: Optional[str] = None
    user: Optional[UserResponse] = None

# -------------------------------------------------------------
# Desk & Verification Schemas
# -------------------------------------------------------------
class VerifiedDeskResponse(BaseModel):
    id: str
    name: str
    building_or_zone: str
    address: str
    operating_hours: str
    officer_on_duty: str
    contact_phone: str
    latitude: float
    longitude: float
    is_active: bool

class OTPRequest(BaseModel):
    phone: str

class OTPVerify(BaseModel):
    phone: str
    code: str

class StatusLookupRequest(BaseModel):
    phone_or_token: str

class AdminAuthRequest(BaseModel):
    pin: str

class HandoverPasscodeVerify(BaseModel):
    passcode: str = Field(..., min_length=6, max_length=6)
    desk_id: Optional[str] = "DESK-MAIN-01"
    officer_name: Optional[str] = "Duty Officer"
