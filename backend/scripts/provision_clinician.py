"""Administrator-only local command: grant a role to an existing verified account.

No public endpoint grants roles. Register/login the account first using the
configured provider, then run: python -m scripts.provision_clinician --email ...
"""
import argparse
import asyncio
from sqlalchemy import select
from database import AsyncSessionLocal, engine
from models.user import User
from models.learner import AccountRole, ClinicianApplication


async def provision(email):
    try:
        async with AsyncSessionLocal() as db:
            user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
            if user is None:
                raise RuntimeError("Account not found. Register and sign in first; no account was fabricated.")
            role = await db.get(AccountRole, user.id)
            if role is None:
                db.add(AccountRole(user_id=user.id, role="clinician"))
                await db.commit()
            print("Clinician role provisioned. Learners must be explicitly assigned by their owner.")
    finally:
        await engine.dispose()


async def list_pending():
    import json
    try:
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(select(User, ClinicianApplication)
                .join(ClinicianApplication, ClinicianApplication.user_id == User.id)
                .outerjoin(AccountRole, AccountRole.user_id == User.id)
                .where(AccountRole.user_id.is_(None))
                .order_by(ClinicianApplication.submitted_at))).all()
            print(json.dumps([{'email': user.email, 'name': user.name,
                **{field: getattr(application, field) for field in ['professional_title', 'registration_number', 'jurisdiction', 'organization']},
                'submitted_at': application.submitted_at.isoformat()} for user, application in rows], indent=2))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--email')
    action.add_argument('--list-pending', action='store_true', help='Administrator-only professional application review')
    args = parser.parse_args()
    asyncio.run(list_pending() if args.list_pending else provision(args.email))
