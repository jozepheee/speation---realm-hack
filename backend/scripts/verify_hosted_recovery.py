"""Exercise real hosted recovery on a dedicated QA identity, without sending mail.

No credentials, tokens or recovery URLs are printed. This does not verify inbox
delivery or the frontend callback, and does not modify the demo clinician.
"""
import asyncio
import json
import secrets
from pathlib import Path
import httpx
from config import settings


async def verify():
    report = {'scope': 'dedicated_hosted_auth_qa_no_email_delivery', 'checks': {}}
    directory = Path(__file__).resolve().parents[2] / 'tmp/auth-validation'
    directory.mkdir(parents=True, exist_ok=True)
    identity_file = directory / 'identity.json'
    admin_key = settings.SUPABASE_SECRET_KEY or settings.SUPABASE_SERVICE_ROLE_KEY
    if not admin_key:
        raise RuntimeError('Server admin credential is required')
    admin_headers = {'apikey': admin_key, 'Authorization': f'Bearer {admin_key}'}
    public_headers = {'apikey': settings.auth_key}
    async with httpx.AsyncClient(timeout=30) as client:
        if identity_file.exists():
            identity = json.loads(identity_file.read_text())
            if identity['project_url'] != settings.auth_url:
                raise RuntimeError('QA identity belongs to another project')
        else:
            identity = {'email': f'auth-qa-{secrets.token_hex(6)}@example.invalid',
                'password': secrets.token_urlsafe(30), 'project_url': settings.auth_url}
            response = await client.post(settings.auth_url + '/auth/v1/admin/users', headers=admin_headers,
                json={'email': identity['email'], 'password': identity['password'], 'email_confirm': True,
                    'user_metadata': {'purpose': 'disposable_auth_protocol_validation_no_patient_data'}})
            response.raise_for_status()
            identity['id'] = response.json()['id']
            identity_file.write_text(json.dumps(identity), encoding='utf-8')

        async def login(password):
            return await client.post(settings.auth_url + '/auth/v1/token?grant_type=password', headers=public_headers,
                json={'email': identity['email'], 'password': password})

        initial = await login(identity['password'])
        initial.raise_for_status()
        report['checks']['initial_real_login'] = initial.status_code == 200
        generated = await client.post(settings.auth_url + '/auth/v1/admin/generate_link', headers=admin_headers,
            json={'type': 'recovery', 'email': identity['email'], 'redirect_to': 'http://127.0.0.1:3100/reset-password'})
        generated.raise_for_status()
        properties = generated.json()
        properties = properties.get('properties', properties)
        token_hash = properties['hashed_token']
        report['checks']['recovery_link_generated'] = bool(token_hash)
        report['requested_redirect'] = 'http://127.0.0.1:3100/reset-password'
        report['accepted_redirect'] = properties.get('redirect_to')
        verified = await client.post(settings.auth_url + '/auth/v1/verify', headers=public_headers,
            json={'type': 'recovery', 'token_hash': token_hash})
        verified.raise_for_status()
        access = verified.json()['access_token']
        report['checks']['real_recovery_token_consumed'] = verified.status_code == 200
        reused = await client.post(settings.auth_url + '/auth/v1/verify', headers=public_headers,
            json={'type': 'recovery', 'token_hash': token_hash})
        report['checks']['used_link_rejected'] = reused.status_code in [400, 401, 403]
        invalid = await client.post(settings.auth_url + '/auth/v1/verify', headers=public_headers,
            json={'type': 'recovery', 'token_hash': secrets.token_hex(32)})
        report['checks']['invalid_link_rejected'] = invalid.status_code in [400, 401, 403]
        old_password = identity['password']
        new_password = secrets.token_urlsafe(30)
        changed = await client.put(settings.auth_url + '/auth/v1/user',
            headers={**public_headers, 'Authorization': f'Bearer {access}'}, json={'password': new_password})
        changed.raise_for_status()
        # Persist the new QA credential immediately; never change the demo account.
        identity['password'] = new_password
        identity_file.write_text(json.dumps(identity), encoding='utf-8')
        report['checks']['password_changed_through_recovery_session'] = changed.status_code == 200
        old = await login(old_password)
        report['checks']['old_password_rejected'] = old.status_code in [400, 401, 403]
        new = await login(new_password)
        new.raise_for_status()
        report['checks']['new_password_login'] = new.status_code == 200
        refreshed = await client.post(settings.auth_url + '/auth/v1/token?grant_type=refresh_token', headers=public_headers,
            json={'refresh_token': new.json()['refresh_token']})
        refreshed.raise_for_status()
        report['checks']['session_refresh'] = refreshed.status_code == 200
        session = refreshed.json()
        logout = await client.post(settings.auth_url + '/auth/v1/logout?scope=global',
            headers={**public_headers, 'Authorization': f"Bearer {session['access_token']}"})
        logout.raise_for_status()
        rejected_refresh = await client.post(settings.auth_url + '/auth/v1/token?grant_type=refresh_token', headers=public_headers,
            json={'refresh_token': session['refresh_token']})
        report['checks']['refresh_after_logout_rejected'] = rejected_refresh.status_code in [400, 401, 403]
    report['all_protocol_checks_passed'] = all(report['checks'].values())
    report['email_delivery_verified'] = False
    (directory / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    asyncio.run(verify())
