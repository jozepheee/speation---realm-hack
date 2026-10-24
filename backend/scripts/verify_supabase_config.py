"""Read-only connection and schema checks; never print keys, URLs or user records."""
import asyncio
import json
import httpx
from sqlalchemy import text
from config import settings
from database import engine, Base
import models


async def main():
    report = {'auth_provider': settings.AUTH_PROVIDER}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            result = await client.get(f'{settings.auth_url}/auth/v1/settings', headers={'apikey': settings.auth_key})
            report['public_auth_configuration'] = result.status_code
            for label, key in [('service_role', settings.SUPABASE_SERVICE_ROLE_KEY), ('server_secret', settings.SUPABASE_SECRET_KEY)]:
                if not key:
                    report[label] = 'not_configured'
                    continue
                result = await client.get(f'{settings.auth_url}/rest/v1/', headers={'apikey': key, 'Accept': 'application/openapi+json'})
                report[label] = result.status_code
        async with engine.connect() as connection:
            assert (await connection.execute(text('SELECT 1'))).scalar_one() == 1
            report['postgresql'] = 'connected_with_verified_tls'
            tables = set((await connection.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public'"))).scalars().all())
            report['missing_application_tables'] = sorted(set(Base.metadata.tables) - tables)
    except Exception as error:
        report['connection_error_type'] = type(error).__name__
        report['next_action'] = 'Review connectivity and configuration; no hosted schema or data was modified.'
    finally:
        await engine.dispose()
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    asyncio.run(main())
