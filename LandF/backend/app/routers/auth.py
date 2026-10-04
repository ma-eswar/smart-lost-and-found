from fastapi import APIRouter, HTTPException, Header, Depends
from typing import Optional, Dict
from datetime import datetime, timedelta
from app.database import get_db_connection
from app.schemas import UserRegister, UserLogin, UserResponse, TokenResponse, OTPRequest, OTPVerify
from app.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
    generate_intake_id,
    normalize_phone,
    generate_otp
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# In-memory storage for active OTPs
ACTIVE_OTPS: Dict[str, str] = {}


def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid token scheme, expected 'Bearer <token>'")
    token = parts[1]
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or expired access token")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, full_name, email, phone, role, created_at FROM users WHERE id = ?", (payload["sub"],))
    user = cursor.fetchone()
    conn.close()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return dict(user)


@router.post("/request-otp")
def request_otp(payload: OTPRequest):
    raw_phone = payload.phone.strip()
    norm_phone = normalize_phone(raw_phone)
    if not norm_phone or len(norm_phone) < 7:
        raise HTTPException(status_code=400, detail="Please enter a valid mobile number.")

    conn = get_db_connection()
    cursor = conn.cursor()

    # Check if this phone number exists in users, lost_items, or found_items
    cursor.execute("""
    SELECT id, full_name, phone FROM users
    WHERE phone = ? OR phone LIKE ?
    """, (raw_phone, f"%{norm_phone}%"))
    user_match = cursor.fetchone()

    cursor.execute("""
    SELECT id, owner_name, owner_phone FROM lost_items
    WHERE owner_phone = ? OR owner_phone LIKE ?
    LIMIT 1
    """, (raw_phone, f"%{norm_phone}%"))
    lost_match = cursor.fetchone()

    cursor.execute("""
    SELECT id, finder_name, finder_phone FROM found_items
    WHERE finder_phone = ? OR finder_phone LIKE ?
    LIMIT 1
    """, (raw_phone, f"%{norm_phone}%"))
    found_match = cursor.fetchone()

    conn.close()

    if not user_match and not lost_match and not found_match:
        return {
            "exists": False,
            "message": "No account found with this phone number. You can only create an account when you submit a Lost or Found report."
        }

    # Generate OTP code (or default 123456)
    otp_code = generate_otp()
    ACTIVE_OTPS[norm_phone] = otp_code

    user_name = "User"
    if user_match:
        user_name = user_match["full_name"]
    elif lost_match:
        user_name = lost_match["owner_name"]
    elif found_match:
        user_name = found_match["finder_name"]

    return {
        "exists": True,
        "message": f"Verification code sent to {raw_phone}",
        "otp_preview": "123456",
        "user_name": user_name
    }


@router.post("/verify-otp", response_model=TokenResponse)
def verify_otp(payload: OTPVerify):
    raw_phone = payload.phone.strip()
    norm_phone = normalize_phone(raw_phone)
    code = payload.code.strip()

    valid_otp = ACTIVE_OTPS.get(norm_phone)
    if code != "123456" and code != valid_otp:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code. Please try again.")

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
        SELECT id, full_name, email, phone, role, created_at FROM users
        WHERE phone = ? OR phone LIKE ?
        """, (raw_phone, f"%{norm_phone}%" if norm_phone else raw_phone))
        user_row = cursor.fetchone()

        now_str = datetime.now().isoformat()

        if not user_row:
            # Check lost_items or found_items for details to create user
            cursor.execute("SELECT owner_name, owner_email, owner_phone FROM lost_items WHERE owner_phone = ? OR owner_phone LIKE ? LIMIT 1", (raw_phone, f"%{norm_phone}%" if norm_phone else raw_phone))
            lost_row = cursor.fetchone()
            
            cursor.execute("SELECT finder_name, finder_email, finder_phone FROM found_items WHERE finder_phone = ? OR finder_phone LIKE ? LIMIT 1", (raw_phone, f"%{norm_phone}%" if norm_phone else raw_phone))
            found_row = cursor.fetchone()

            full_name = "Campus User"
            candidate_email = f"user_{norm_phone}@campus.edu"

            if lost_row and lost_row["owner_name"]:
                full_name = lost_row["owner_name"]
                if lost_row["owner_email"]:
                    candidate_email = lost_row["owner_email"].strip().lower()
            elif found_row and found_row["finder_name"]:
                full_name = found_row["finder_name"]
                if found_row["finder_email"]:
                    candidate_email = found_row["finder_email"].strip().lower()

            # Check if this email is already registered to a user
            cursor.execute("SELECT id, full_name, email, phone, role, created_at FROM users WHERE lower(email) = ?", (candidate_email,))
            existing_by_email = cursor.fetchone()

            if existing_by_email:
                # Associate new/clean phone number with this existing user account
                cursor.execute("UPDATE users SET phone = ? WHERE id = ?", (raw_phone, existing_by_email["id"]))
                conn.commit()
                user = {
                    "id": existing_by_email["id"],
                    "full_name": existing_by_email["full_name"],
                    "email": existing_by_email["email"],
                    "phone": raw_phone,
                    "role": existing_by_email["role"],
                    "created_at": existing_by_email["created_at"]
                }
            else:
                user_id = generate_intake_id("USER")
                pwd_hash = hash_password("123456")

                try:
                    cursor.execute("""
                    INSERT INTO users (id, full_name, email, phone, password_hash, role, created_at)
                    VALUES (?, ?, ?, ?, ?, 'user', ?)
                    """, (user_id, full_name, candidate_email, raw_phone, pwd_hash, now_str))
                    conn.commit()
                    user = {
                        "id": user_id,
                        "full_name": full_name,
                        "email": candidate_email,
                        "phone": raw_phone,
                        "role": "user",
                        "created_at": now_str
                    }
                except Exception:
                    # Fallback unique email if conflict occurred
                    unique_email = f"user_{norm_phone}_{user_id[-4:]}@campus.edu"
                    cursor.execute("""
                    INSERT INTO users (id, full_name, email, phone, password_hash, role, created_at)
                    VALUES (?, ?, ?, ?, ?, 'user', ?)
                    """, (user_id, full_name, unique_email, raw_phone, pwd_hash, now_str))
                    conn.commit()
                    user = {
                        "id": user_id,
                        "full_name": full_name,
                        "email": unique_email,
                        "phone": raw_phone,
                        "role": "user",
                        "created_at": now_str
                    }
        else:
            user = dict(user_row)
    finally:
        conn.close()

    user_data = UserResponse(
        id=user["id"],
        full_name=user["full_name"],
        email=user["email"],
        phone=user["phone"],
        role=user["role"],
        created_at=user["created_at"]
    )

    token = create_access_token({"sub": user["id"], "email": user["email"], "name": user["full_name"]})

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=user_data
    )


@router.post("/register", response_model=TokenResponse)
def register(payload: UserRegister):
    conn = get_db_connection()
    cursor = conn.cursor()

    email_clean = payload.email.strip().lower()
    raw_phone = payload.phone.strip()
    norm_phone = normalize_phone(raw_phone)

    # Check unique email
    cursor.execute("SELECT id FROM users WHERE lower(email) = ?", (email_clean,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="An account with this email address already exists.")

    # Check unique phone
    cursor.execute("SELECT id FROM users WHERE phone = ? OR phone LIKE ?", (raw_phone, f"%{norm_phone}%"))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="An account with this phone number already exists.")

    user_id = generate_intake_id("USER")
    pwd_hash = hash_password(payload.password)
    now_str = datetime.now().isoformat()

    cursor.execute("""
    INSERT INTO users (id, full_name, email, phone, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, ?, 'user', ?)
    """, (
        user_id,
        payload.full_name.strip(),
        email_clean,
        raw_phone,
        pwd_hash,
        now_str
    ))
    conn.commit()
    conn.close()

    user_data = UserResponse(
        id=user_id,
        full_name=payload.full_name.strip(),
        email=email_clean,
        phone=raw_phone,
        role="user",
        created_at=now_str
    )

    token = create_access_token({"sub": user_id, "email": email_clean, "name": payload.full_name.strip()})

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=user_data
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin):
    ident = payload.identifier.strip()
    norm_phone = normalize_phone(ident)
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT id, full_name, email, phone, password_hash, role, created_at
    FROM users
    WHERE lower(email) = ? OR phone = ? OR phone LIKE ?
    """, (ident.lower(), ident, f"%{norm_phone}%"))
    user = cursor.fetchone()
    conn.close()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email/phone or password.")

    if not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email/phone or password.")

    user_data = UserResponse(
        id=user["id"],
        full_name=user["full_name"],
        email=user["email"],
        phone=user["phone"],
        role=user["role"],
        created_at=user["created_at"]
    )

    token = create_access_token({"sub": user["id"], "email": user["email"], "name": user["full_name"]})

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=user_data
    )


@router.get("/me")
def get_profile(authorization: Optional[str] = Header(None)):
    user = get_current_user(authorization)

    # Fetch user's active submissions
    norm_phone = normalize_phone(user["phone"])
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT COUNT(*) FROM lost_items 
    WHERE user_id = ? OR owner_phone = ? OR owner_phone LIKE ?
    """, (user["id"], user["phone"], f"%{norm_phone}%"))
    lost_count = cursor.fetchone()[0]

    cursor.execute("""
    SELECT COUNT(*) FROM found_items 
    WHERE user_id = ? OR finder_phone = ? OR finder_phone LIKE ?
    """, (user["id"], user["phone"], f"%{norm_phone}%"))
    found_count = cursor.fetchone()[0]

    conn.close()

    return {
        "user": user,
        "metrics": {
            "lost_items_count": lost_count,
            "found_items_count": found_count
        }
    }

