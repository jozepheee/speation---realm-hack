"""Create an isolated, empty local clinician workspace for UI verification.

Does not touch the configured hosted database. Credentials are written only to
the ignored tmp directory. No learner, recording or performance is fabricated.
"""
import asyncio
import secrets
import base64
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select
from database import Base
import models
from models.user import User
from models.learner import LocalCredential, AccountRole
from auth.service import get_password_hash


async def main():
    root = Path(__file__).resolve().parents[2]
    directory = root / "tmp"
    directory.mkdir(exist_ok=True)
    database_path = (directory / "foundations-demo.db").as_posix()
    engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            user = (await db.execute(select(User).where(User.email.in_(["clinician.demo@example.com", "clinician.demo@neuronudge.local"])))).scalar_one_or_none()
            if user and user.email.endswith('@neuronudge.local'):
                user.email = 'clinician.demo@example.com'
                await db.commit()
                credential_file = directory / 'demo-clinician-credentials.txt'
                credential_file.write_text(credential_file.read_text(encoding='utf-8').replace('clinician.demo@neuronudge.local', 'clinician.demo@example.com'), encoding='utf-8')
            if user is None:
                password = secrets.token_urlsafe(24)
                user = User(email="clinician.demo@example.com", name="Demo clinician")
                db.add(user)
                await db.flush()
                db.add(LocalCredential(user_id=user.id, password_hash=get_password_hash(password)))
                db.add(AccountRole(user_id=user.id, role="clinician"))
                await db.commit()
                (directory / "demo-clinician-credentials.txt").write_text(
                    "LOCAL WORKSPACE ONLY — NOT A CLINICAL IDENTITY\n"
                    f"Email: {user.email}\nPassword: {password}\n", encoding="utf-8")
        runtime = directory / "foundations-runtime.env"
        if not runtime.exists():
            runtime.write_text(f"DATABASE_URL=sqlite+aiosqlite:///{database_path}\n"
                f"JWT_SECRET={secrets.token_urlsafe(48)}\nAUTH_PROVIDER=local\nAPP_ENV=development\n"
                "CHROMA_API_KEY=\nCHROMA_TENANT=\nCHROMA_DATABASE=\nMEMGRAPH_URI=bolt://127.0.0.1:7688\n", encoding="utf-8")
        if 'AUDIO_ENCRYPTION_KEY=' not in runtime.read_text(encoding='utf-8'):
            with runtime.open('a', encoding='utf-8') as stream:
                stream.write(f"AUDIO_ENCRYPTION_KEY={base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()}\n")
        print("Isolated clinician account ready; credentials and runtime configuration are in ignored tmp files.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
