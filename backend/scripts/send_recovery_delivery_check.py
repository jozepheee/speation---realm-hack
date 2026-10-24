"""Send one explicitly authorized recovery email; never changes a password.

A durable attempt receipt prevents automatic duplicate sends, including after
an ambiguous timeout. No tokens, recovery URLs or email addresses are printed.
Inbox receipt must be confirmed separately by the owner.
"""
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit
import httpx
from config import settings


async def send(email, redirect_to):
    parsed = urlsplit(redirect_to)
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path != '/reset-password':
        raise ValueError('Use the application reset-password callback without credentials or query parameters')
    if parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in ['localhost', '127.0.0.1']):
        raise ValueError('Recovery requires HTTPS or a local preview callback')
    if settings.AUTH_PROVIDER != 'supabase' or not settings.auth_url or not settings.auth_key:
        raise RuntimeError('Hosted Supabase authentication must be configured')
    directory = Path(__file__).resolve().parents[2] / 'tmp/auth-validation'
    directory.mkdir(parents=True, exist_ok=True)
    fingerprint = hashlib.sha256((settings.auth_url + '\n' + email.casefold()).encode()).hexdigest()
    receipt = directory / f'delivery-attempt-{fingerprint[:20]}.json'
    report = {'attempted_at': datetime.now(timezone.utc).isoformat(),
        'state': 'attempt_started', 'password_changed': False, 'delivery_confirmed': False}
    # Acquire the one-send receipt before opening a connection. Never retry a
    # timed-out POST: the identity provider may already have queued its email.
    with receipt.open('x', encoding='utf-8') as output:
        json.dump(report, output, indent=2)
    try:
        async with httpx.AsyncClient(timeout=25, follow_redirects=False) as client:
            response = await client.post(settings.auth_url + '/auth/v1/recover',
                headers={'apikey': settings.auth_key}, params={'redirect_to': redirect_to}, json={'email': email})
        report.update(http_status=response.status_code,
            state='request_accepted_receipt_unconfirmed' if response.is_success else 'provider_rejected_request')
    except httpx.HTTPError:
        report['state'] = 'transport_outcome_unknown_do_not_retry_automatically'
    receipt.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))
    return 0 if report['state'] == 'request_accepted_receipt_unconfirmed' else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--email', required=True, help='The inbox explicitly authorized by its owner')
    parser.add_argument('--redirect-to', required=True)
    args = parser.parse_args()
    raise SystemExit(asyncio.run(send(args.email, args.redirect_to)))
