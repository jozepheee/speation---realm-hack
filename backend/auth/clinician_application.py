"""Self-reported registration details never confer a privileged account role."""
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from models.learner import ClinicianApplication
from schemas.auth import ClinicianDetails


async def capture_application(db, user_id, metadata):
    if not isinstance(metadata, dict) or metadata.get('account_type') != 'clinician':
        return
    try:
        details = ClinicianDetails.model_validate(metadata.get('clinician_application'))
    except ValidationError:
        return  # Auth metadata is applicant-controlled, not an authorization source.
    if await db.get(ClinicianApplication, user_id) is not None:
        return
    try:
        async with db.begin_nested():
            db.add(ClinicianApplication(user_id=user_id, **details.model_dump()))
            await db.flush()
        await db.commit()
    except IntegrityError:
        # Two simultaneous first-login requests may capture the same application.
        if await db.get(ClinicianApplication, user_id) is None:
            raise
