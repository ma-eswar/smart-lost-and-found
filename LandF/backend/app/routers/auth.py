from fastapi import APIRouter, HTTPException, Header, Depends
from typing import Optional
from datetime import datetime, timedelta
from app.database import get_db_connection
from app.schemas import UserRegister, UserLogin, UserResponse, TokenResponse
from app.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
    generate_intake_id
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

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


@router.post("/register", response_model=TokenResponse)
def register(payload: UserRegister):
    conn = get_db_connection()
    cursor = conn.cursor()

    email_clean = payload.email.strip().lower()
    phone_clean = payload.phone.strip()

    # Check unique email
    cursor.execute("SELECT id FROM users WHERE lower(email) = ?", (email_clean,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="An account with this email address already exists.")

    # Check unique phone
    cursor.execute("SELECT id FROM users WHERE phone = ?", (phone_clean,))
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
        phone_clean,
        pwd_hash,
        now_str
    ))
    conn.commit()
    conn.close()

    user_data = UserResponse(
        id=user_id,
        full_name=payload.full_name.strip(),
        email=email_clean,
        phone=phone_clean,
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
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT id, full_name, email, phone, password_hash, role, created_at
    FROM users
    WHERE lower(email) = ? OR phone = ?
    """, (ident.lower(), ident))
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
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM lost_items WHERE user_id = ? OR owner_phone = ?", (user["id"], user["phone"]))
    lost_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM found_items WHERE user_id = ? OR finder_phone = ?", (user["id"], user["phone"]))
    found_count = cursor.fetchone()[0]

    conn.close()

    return {
        "user": user,
        "metrics": {
            "lost_items_count": lost_count,
            "found_items_count": found_count
        }
    }
