import uuid
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models.user import User
from auth.service import decode_access_token
from config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User:
    denied = HTTPException(401, "Could not validate credentials", headers={"WWW-Authenticate": "Bearer"})
    if not token:
        raise denied
    if settings.AUTH_PROVIDER == 'supabase':
        from utils.supabase_client import verify_supabase_token
        payload = await verify_supabase_token(token)
    else:
        payload = decode_access_token(token)
    if not payload:
        raise denied
    try:
        user_id = uuid.UUID(str(payload['sub']))
    except (ValueError, KeyError, TypeError):
        raise denied
    user = await db.get(User, user_id)
    if user is None and settings.AUTH_PROVIDER == 'supabase' and payload.get('email'):
        metadata = payload.get('user_metadata') or {}
        user = User(id=user_id, email=payload['email'], name=metadata.get('name'),
                    personality=metadata.get('personality') or 'auditory')
        db.add(user)
        await db.commit()
        await db.refresh(user)
        from auth.clinician_application import capture_application
        await capture_application(db, user_id, metadata)
    if user is None:
        raise denied
    return user

async def get_optional_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    if not token:
        return None
    # Supplying an invalid token must not downgrade an authenticated request to a guest.
    return await get_current_user(token, db)
