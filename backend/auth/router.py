import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool
import httpx
from database import get_db
from models.user import User
from models.learner import LocalCredential, ClinicianApplication
from schemas.auth import UserRegister, UserLogin, TokenResponse, UserOut, ClinicianDetails, AuthenticatedUserOut
from auth.clinician_application import capture_application
from auth.service import get_password_hash, verify_password, create_access_token
from auth.dependencies import get_current_user
from config import settings

router = APIRouter(tags=["auth"])

async def provider_request(path, body):
    if not settings.auth_url or not settings.auth_key:
        raise HTTPException(503, "Authentication provider is not configured")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(f"{settings.auth_url}/auth/v1/{path}",
                headers={"apikey": settings.auth_key}, json=body)
    except httpx.HTTPError as error:
        raise HTTPException(503, "Authentication provider is unavailable") from error
    if response.status_code >= 500:
        raise HTTPException(503, "Authentication provider is unavailable")
    if response.status_code >= 400:
        raise HTTPException(401, "Authentication failed. Check your credentials and account verification.")
    return response.json()

async def sync_profile(db, identity):
    user_id = uuid.UUID(identity['id'])
    user = await db.get(User, user_id)
    if user is None:
        metadata = identity.get('user_metadata') or {}
        user = User(id=user_id, email=identity['email'], name=metadata.get('name'),
                    personality=metadata.get('personality') or 'auditory')
        db.add(user)
        await db.commit()
        await db.refresh(user)
    await capture_application(db, user_id, identity.get('user_metadata') or {})
    return user

@router.post("/register")
async def register(payload: UserRegister, db: AsyncSession = Depends(get_db)):
    metadata = {'name': payload.name, 'personality': payload.personality,
        'account_type': payload.account_type,
        'clinician_application': payload.clinician_application.model_dump() if payload.clinician_application else None}
    if settings.AUTH_PROVIDER == 'supabase':
        result = await provider_request('signup', {'email': payload.email, 'password': payload.password,
            'data': metadata})
        if not result.get('access_token'):
            return JSONResponse(status_code=202, content={'requires_email_verification': True,
                'message': 'Check your email to confirm your account before signing in.'})
        user = await sync_profile(db, result['user'])
        return TokenResponse(access_token=result['access_token'], user=UserOut.model_validate(user))
    if len(settings.JWT_SECRET) < 32:
        raise HTTPException(503, 'Local authentication is not configured')
    hashed = await run_in_threadpool(get_password_hash, payload.password)
    user = User(email=payload.email, name=payload.name, personality=payload.personality)
    db.add(user)
    try:
        await db.flush()
        db.add(LocalCredential(user_id=user.id, password_hash=hashed))
        await db.commit()
        await db.refresh(user)
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(409, 'An account with this email already exists') from error
    await capture_application(db, user.id, metadata)
    return TokenResponse(access_token=create_access_token({'sub': str(user.id)}), user=UserOut.model_validate(user))


@router.get('/clinician-application')
async def application_status(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from learners.access import is_clinician
    approved = await is_clinician(db, user.id)
    application = await db.get(ClinicianApplication, user.id)
    return {'status': 'approved' if approved else 'pending' if application else 'not_submitted',
        'details': {key: getattr(application, key) for key in ClinicianDetails.model_fields} if application else None,
        'submitted_at': application.submitted_at.isoformat() if application else None}


@router.put('/clinician-application')
async def submit_application(payload: ClinicianDetails, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from learners.access import is_clinician
    if await is_clinician(db, user.id):
        raise HTTPException(409, 'Professional access is already active. Contact the administrator to change verified registration details.')
    application = await db.get(ClinicianApplication, user.id)
    if application:
        for key, value in payload.model_dump().items():
            setattr(application, key, value)
        await db.commit()
    else:
        await capture_application(db, user.id, {'account_type': 'clinician', 'clinician_application': payload.model_dump()})
    return await application_status(user, db)

@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)):
    if settings.AUTH_PROVIDER == 'supabase':
        result = await provider_request('token?grant_type=password', {'email': payload.email, 'password': payload.password})
        user = await sync_profile(db, result['user'])
        return TokenResponse(access_token=result['access_token'], user=UserOut.model_validate(user))
    if len(settings.JWT_SECRET) < 32:
        raise HTTPException(503, 'Local authentication is not configured')
    row = (await db.execute(select(User, LocalCredential).join(LocalCredential,
        LocalCredential.user_id == User.id).where(User.email == payload.email))).first()
    # Same expensive verification path for known and unknown accounts.
    stored_hash = row[1].password_hash if row else 'pbkdf2_sha256:600000:' + '0' * 32 + ':' + '0' * 64
    valid = await run_in_threadpool(verify_password, payload.password, stored_hash)
    if not row or not valid:
        raise HTTPException(401, 'Incorrect email or password')
    return TokenResponse(access_token=create_access_token({'sub': str(row[0].id)}), user=UserOut.model_validate(row[0]))

@router.get('/me', response_model=AuthenticatedUserOut)
async def get_me(current_user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    from learners.access import is_clinician
    return {**UserOut.model_validate(current_user).model_dump(),'workspace_role':'clinician' if await is_clinician(db,current_user.id) else 'guardian_or_participant'}
