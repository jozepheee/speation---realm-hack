"""Provision the authorized empty demo clinician in the selected Supabase project."""
import argparse
import asyncio
from pathlib import Path
import httpx
from sqlalchemy import text
from config import settings
from database import engine, AsyncSessionLocal
from models.user import User
from models.learner import AccountRole


async def main(project_ref):
    if settings.auth_url != f'https://{project_ref}.supabase.co' or settings.AUTH_PROVIDER != 'supabase':
        raise RuntimeError('Environment does not match the explicitly selected project')
    root = Path(__file__).resolve().parents[2]
    source = (root / 'tmp/demo-clinician-credentials.txt').read_text(encoding='utf-8')
    password = next(line.split(': ', 1)[1] for line in source.splitlines() if line.startswith('Password: '))
    email = 'clinician.demo@example.com'
    headers = {'apikey': settings.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': f'Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}'}
    try:
        async with engine.connect() as connection:
            identity = (await connection.execute(text('SELECT id FROM auth.users WHERE email=:email'), {'email': email})).scalar_one_or_none()
        async with httpx.AsyncClient(timeout=20) as client:
            if identity is None:
                response = await client.post(f'{settings.auth_url}/auth/v1/admin/users', headers=headers,
                    json={'email': email, 'password': password, 'email_confirm': True,
                          'user_metadata': {'name': 'Demo clinician', 'demo_account': True}})
                response.raise_for_status()
                import uuid
                identity = uuid.UUID(response.json()['id'])
            # Verify actual password login without printing or saving access tokens.
            response = await client.post(f'{settings.auth_url}/auth/v1/token?grant_type=password',
                headers={'apikey': settings.auth_key}, json={'email': email, 'password': password})
            response.raise_for_status()
            assert response.json()['user']['id'] == str(identity)
        async with AsyncSessionLocal() as db:
            profile = await db.get(User, identity)
            if profile is None:
                db.add(User(id=identity, email=email, name='Demo clinician', personality='auditory'))
                await db.flush()
            if await db.get(AccountRole, identity) is None:
                db.add(AccountRole(user_id=identity, role='clinician'))
            await db.commit()
        path = root / 'tmp/supabase-demo-clinician-credentials.txt'
        path.write_text(f'SUPABASE DEMO ACCOUNT — NOT A VERIFIED CLINICAL IDENTITY\nProject: {project_ref}\nEmail: {email}\nPassword: {password}\nNo learners or performance data are seeded.\n', encoding='utf-8')
        print('Supabase demo clinician provisioned; actual password login verified. Credentials saved in ignored tmp file. No patient data imported.')
    except Exception as error:
        print('Demo synchronization failed:', type(error).__name__, '(secrets and provider response withheld)')
        raise SystemExit(1) from None
    finally:
        await engine.dispose()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project-ref', required=True)
    asyncio.run(main(parser.parse_args().project_ref))
