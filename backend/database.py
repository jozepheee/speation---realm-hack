import os
import ssl
from sqlalchemy.engine import make_url
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from config import settings

database_url = settings.DATABASE_URL
if database_url.startswith('postgresql://'):
    database_url = database_url.replace('postgresql://', 'postgresql+asyncpg://', 1)
elif database_url.startswith('postgres://'):
    database_url = database_url.replace('postgres://', 'postgresql+asyncpg://', 1)

# Fallback to local async sqlite if postgres connection string not set or for local lightweight testing
if not database_url.startswith("postgresql+asyncpg://") and not database_url.startswith("sqlite+aiosqlite://"):
    raise RuntimeError('Use a configured PostgreSQL or SQLite async database URL')

connect_args = {}
if "postgresql+asyncpg" in database_url:
    connect_args['command_timeout'] = 30
    connect_args['timeout'] = 10
    connect_args["statement_cache_size"] = 0
    connect_args['prepared_statement_cache_size'] = 0
    host = make_url(database_url).host or ''
    if host.endswith('.pooler.supabase.com') or host.endswith('.supabase.co'):
        # Standard verify-full TLS, matching the deployed Python 3.11 client.
        # Supabase's CA intermediate currently omits a KeyUsage extension;
        # Python 3.13's optional X509_STRICT mode rejects that certificate.
        # Chain signatures, the trusted root and hostname remain mandatory.
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.verify_mode = ssl.CERT_REQUIRED
        context.check_hostname = True
        context.load_default_certs()
        connect_args['ssl'] = context
        if settings.DATABASE_CA_CERT:
            connect_args['ssl'].load_verify_locations(cafile=settings.DATABASE_CA_CERT)

engine = create_async_engine(
    database_url,
    echo=False,
    hide_parameters=True,
    future=True,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args=connect_args,
    # API and worker each own a pool; leave room within the hosted session limit.
    **({'pool_size': 3, 'max_overflow': 1, 'pool_timeout': 15}
       if database_url.startswith('postgresql+asyncpg://') else {})
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

class Base(DeclarativeBase):
    pass

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except TimeoutError as error:
            from fastapi import HTTPException
            raise HTTPException(503, 'The database connection timed out. Please retry shortly.') from error
        finally:
            await session.close()
