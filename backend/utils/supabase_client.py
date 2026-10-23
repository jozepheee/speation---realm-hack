"""Supabase auth is verified by the provider; raw audio is never public here."""
import httpx
from fastapi import HTTPException
from config import settings

async def verify_supabase_token(token: str):
    if not settings.auth_url or not settings.auth_key:
        raise HTTPException(503, 'Authentication provider is not configured')
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f'{settings.auth_url}/auth/v1/user',
                headers={'apikey': settings.auth_key, 'Authorization': f'Bearer {token}'})
    except httpx.HTTPError as error:
        raise HTTPException(503, 'Authentication provider is unavailable') from error
    if response.status_code >= 500 or response.status_code == 429:
        raise HTTPException(503, 'Authentication provider is unavailable')
    if response.status_code != 200:
        return None
    try:identity = response.json()
    except ValueError as error:raise HTTPException(503,'Authentication provider returned an invalid response') from error
    if not isinstance(identity,dict):raise HTTPException(503,'Authentication provider returned an invalid response')
    if not identity.get('id') or not identity.get('email_confirmed_at'):
        return None
    return {**identity, 'sub': identity['id']}

async def upload_audio_to_supabase(audio_bytes: bytes, file_name: str):
    # Retired: a user-authorized private-storage flow replaces this public upload.
    raise RuntimeError('Public audio upload is disabled; use consented private storage')
