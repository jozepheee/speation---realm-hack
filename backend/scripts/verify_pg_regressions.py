"""Run software fixtures in a disposable DB on the dedicated local verifier.

Never reads the application's database URL or connects to hosted Supabase.
The generated database is removed after the checks, including on failure.
"""
import asyncio
import os
from pathlib import Path
import sys
import uuid
import asyncpg


async def main():
    name = 'speation_test_' + uuid.uuid4().hex
    control = await asyncpg.connect('postgresql://postgres:local-test-only@127.0.0.1:5544/postgres', timeout=10)
    created = False
    try:
        await control.execute(f'CREATE DATABASE "{name}"')
        created = True
        environment = {**os.environ, 'PYTEST_DISABLE_PLUGIN_AUTOLOAD': '1',
            'CARE_TEST_DATABASE_URL': f'postgresql+asyncpg://postgres:local-test-only@127.0.0.1:5544/{name}'}
        child = await asyncio.create_subprocess_exec(sys.executable, '-m', 'pytest', '-q',
            'backend/tests/test_care_experiences.py', 'backend/tests/test_speech_workflows.py', '--tb=short',
            cwd=Path(__file__).resolve().parents[2], env=environment)
        result = await child.wait()
        return result
    finally:
        if created:
            await control.execute(f'DROP DATABASE "{name}" WITH (FORCE)')
            print('Disposable local PostgreSQL fixture database removed.')
        await control.close()


if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))
