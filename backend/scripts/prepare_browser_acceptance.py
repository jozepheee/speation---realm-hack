"""Prepare one explicit software fixture through the real authenticated API.

Uses existing, ignored QA credentials; no new auth identity, recordings, cloud
permissions or fabricated clinical observations. Re-running reuses the profile.
"""
import asyncio
import json
import re
from pathlib import Path

import httpx
from config import settings

ROOT = Path(__file__).resolve().parents[2]
NAME = 'SOFTWARE QA · 21 · not a patient'


async def prepare():
    identity = json.loads((ROOT / 'tmp/auth-validation/identity.json').read_text())
    if identity['project_url'] != settings.auth_url:
        raise RuntimeError('QA identity belongs to another project')
    credentials = (ROOT / 'tmp/supabase-demo-clinician-credentials.txt').read_text()
    clinician = {key: re.search(rf'^{key}\s*[:=]\s*(.+)$', credentials, re.M | re.I).group(1).strip()
                 for key in ['email', 'password']}
    async with httpx.AsyncClient(timeout=90) as client:
        async def login(account):
            response = await client.post(settings.auth_url + '/auth/v1/token?grant_type=password',
                headers={'apikey': settings.auth_key},
                json={key: account[key] for key in ['email', 'password']})
            if response.status_code != 200:
                raise RuntimeError(f'Fixture authentication failed ({response.status_code})')
            return {'Authorization': 'Bearer ' + response.json()['access_token']}

        owner_headers, clinician_headers = await login(identity), await login(clinician)

        async def api(path, headers, method='GET', body=None):
            response = await client.request(method, 'http://127.0.0.1:3100/api' + path,
                headers=headers, json=body)
            if not response.is_success:
                raise RuntimeError(f'Fixture API {method} {path}: HTTP {response.status_code}')
            return response.json()

        roster = await api('/learners', owner_headers)
        learner = next((item for item in roster if item['display_name'] == NAME), None)
        if learner is None:
            learner = await api('/learners', owner_headers, 'POST', {
                'display_name': NAME, 'age': 21, 'language': 'en', 'relationship': 'self',
                'consent': {'practice_allowed': True, 'cloud_processing_allowed': False,
                    'retain_audio_allowed': False, 'authorized_to_consent': True,
                    'policy_version': '2026-10-14-v1'}})
        learner_id = learner['id']
        await api(f'/learners/{learner_id}/clinician', owner_headers, 'PUT',
                  {'clinician_email': clinician['email'], 'active': True})
        existing = await api(f'/learners/{learner_id}/activities', clinician_headers)
        samples = [
            {'kind': 'syllable', 'word': 'water', 'syllables': ['wa', 'ter']},
            {'kind': 'picture', 'word': 'water', 'picture': 'water'},
            {'kind': 'picture', 'word': 'apple', 'picture': 'apple'},
            {'kind': 'picture', 'word': 'home', 'picture': 'home'},
            {'kind': 'rhythm', 'word': 'comfortable taps', 'beat_intervals': [.7, .7, .7]},
        ]
        for sample in samples:
            title = 'SOFTWARE QA · ' + sample['kind'] + ' · ' + sample['word']
            if any(item['title'] == title for item in existing):
                continue
            await api(f'/learners/{learner_id}/activities', clinician_headers, 'POST', {
                **sample, 'title': title, 'language': 'en', 'min_age': 21, 'max_age': 21,
                'instruction': 'Software interaction fixture only. Not clinically validated content.'})
        manifest = {'learner_id': learner_id, 'name': NAME, 'language': 'en',
            'purpose': 'software_browser_acceptance_only', 'clinical_validation': False,
            'cloud_processing_allowed': bool((learner.get('consent') or {}).get('cloud_processing_allowed')), 'audio_retention_allowed': False}
        (ROOT / 'tmp/auth-validation/browser-fixture.json').write_text(json.dumps(manifest, indent=2))
        print('Software browser fixture ready; 5 catalog activities; no patient recordings or clinical outcomes.')


if __name__ == '__main__':
    asyncio.run(prepare())
