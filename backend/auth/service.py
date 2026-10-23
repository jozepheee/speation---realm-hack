from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
from jose import JWTError, jwt
from config import settings

ITERATIONS = 600_000

def get_password_hash(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), ITERATIONS)
    return f"pbkdf2_sha256:{ITERATIONS}:{salt}:{digest.hex()}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        algorithm, iterations, salt, digest = hashed_password.split(":")
        count = int(iterations)
        if algorithm != "pbkdf2_sha256" or not 100_000 <= count <= 1_000_000:
            return False
        computed = hashlib.pbkdf2_hmac("sha256", plain_password.encode(), bytes.fromhex(salt), count)
        return hmac.compare_digest(computed.hex(), digest)
    except (ValueError, TypeError, AttributeError):
        return False

def create_access_token(data: dict, expires_delta=None) -> str:
    if len(settings.JWT_SECRET) < 32:
        raise RuntimeError("Local authentication requires a JWT_SECRET of at least 32 characters")
    now = datetime.now(timezone.utc)
    payload = {**data, "iat": now, "exp": now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)),
               "iss": "neuronudge", "aud": "neuronudge-api"}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

def decode_access_token(token: str):
    if settings.AUTH_PROVIDER != "local" or len(settings.JWT_SECRET) < 32:
        return None
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM],
                          issuer="neuronudge", audience="neuronudge-api",
                          options={"require_exp": True, "require_iat": True, "require_sub": True})
    except JWTError:
        return None
