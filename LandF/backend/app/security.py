import hashlib
import hmac
import json
import base64
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from app.config import JWT_SECRET, ALGORITHM

# Fix passlib compatibility with bcrypt >= 4.0/5.0
try:
    import bcrypt
    if not hasattr(bcrypt, "__about__"):
        class _About:
            __version__ = getattr(bcrypt, "__version__", "5.0.0")
        bcrypt.__about__ = _About
except Exception:
    pass

# Try importing passlib / bcrypt with fallback to hashlib pbkdf2_hmac for maximum portability
try:
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
except Exception:
    pwd_context = None

# Try importing python-jose jwt
try:
    from jose import jwt, JWTError
except Exception:
    jwt = None
    JWTError = Exception


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt with PBKDF2 fallback."""
    if not password:
        raise ValueError("Password cannot be empty")
    if pwd_context is not None:
        try:
            return pwd_context.hash(password)
        except Exception:
            pass
    # Fallback: Salted PBKDF2-SHA256
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
    return f"pbkdf2_sha256${salt}${key.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against stored hash."""
    if not plain_password or not hashed_password:
        return False
    if hashed_password.startswith("pbkdf2_sha256$"):
        try:
            parts = hashed_password.split("$")
            if len(parts) == 3:
                salt = parts[1]
                stored_key = parts[2]
                key = hashlib.pbkdf2_hmac('sha256', plain_password.encode('utf-8'), salt.encode('utf-8'), 100000)
                return hmac.compare_digest(key.hex(), stored_key)
        except Exception:
            return False
    if pwd_context is not None:
        try:
            return pwd_context.verify(plain_password, hashed_password)
        except Exception:
            pass
    return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=7)
    to_encode.update({"exp": expire.timestamp()})
    
    if jwt is not None:
        try:
            return jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)
        except Exception:
            pass

    # Built-in lightweight signed JWT implementation
    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    payload_b64 = base64.urlsafe_b64encode(json.dumps(to_encode).encode()).decode().rstrip("=")
    signing_input = f"{header_b64}.{payload_b64}"
    sig = hmac.new(JWT_SECRET.encode(), signing_input.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).decode().rstrip("=")
    return f"{signing_input}.{sig_b64}"


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate a signed JWT token."""
    if not token:
        return None
    if jwt is not None:
        try:
            return jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        except Exception:
            pass

    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts
        signing_input = f"{header_b64}.{payload_b64}"
        expected_sig = hmac.new(JWT_SECRET.encode(), signing_input.encode(), hashlib.sha256).digest()
        actual_sig = base64.urlsafe_b64decode(sig_b64 + "=" * (-len(sig_b64) % 4))
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None
        payload_json = base64.urlsafe_b64decode(payload_b64 + "=" * (-len(payload_b64) % 4)).decode()
        payload = json.loads(payload_json)
        if "exp" in payload and datetime.utcnow().timestamp() > payload["exp"]:
            return None
        return payload
    except Exception:
        return None


def hash_identifier(raw_id: str) -> str:
    """Safely hash sensitive Institutional/Government ID numbers."""
    if not raw_id:
        return ""
    clean_id = raw_id.strip().upper()
    return hashlib.sha256(clean_id.encode('utf-8')).hexdigest()


def get_last_4(raw_id: str) -> str:
    """Get last 4 digits for desk operator verification without exposing full ID."""
    clean_id = raw_id.strip()
    if len(clean_id) <= 4:
        return clean_id
    return clean_id[-4:]


def generate_access_token() -> str:
    """Generate cryptographically secure tracking access token for the user."""
    return secrets.token_urlsafe(24)


def generate_intake_id(prefix: str = "REC") -> str:
    """Generates human-readable IDs (e.g., LOST-261003-A1B2, FND-261003-C3D4)."""
    timestamp = datetime.now().strftime("%y%m%d")
    random_suffix = secrets.token_hex(2).upper()
    return f"{prefix}-{timestamp}-{random_suffix}"


def generate_otp() -> str:
    """Generates random 6-digit numeric string."""
    return f"{secrets.randbelow(900000) + 100000}"


def normalize_phone(raw_phone: str) -> str:
    """
    Normalizes phone numbers so '+91 93924 57668', '9392457668', '09392457668', '+919392457668'
    all evaluate to the identical 10-digit clean standard string (e.g. '9392457668').
    """
    if not raw_phone:
        return ""
    import re
    digits = re.sub(r"\D", "", str(raw_phone))
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits

