"""Private, learner-scoped adult demonstrations, separate from learner scores."""
import io,uuid
from fastapi import APIRouter,Depends,HTTPException,UploadFile,File,Form
from fastapi.responses import Response
from sqlalchemy import select,func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel,ConfigDict
from starlette.concurrency import run_in_threadpool
from database import get_db
from auth.dependencies import get_current_user
from models.user import User
from models.learning import LearningDemonstration
from models.care import StorageDeletion
from models.learner import ClinicianAssignment
from learners.access import accessible_learner,require_practice_consent,is_clinician
from learners import storage
from fluency.audio import decode_audio
from ml_settings import InvalidAudioError

router=APIRouter(tags=['private-learning-demonstrations'])
TYPES={'audio/webm','video/webm','audio/mp4','video/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/ogg','video/ogg'}

def public(row):
    return {'id':str(row.id),'target':row.target,'media_type':row.media_type,'status':row.status,
        'created_at':row.created_at.isoformat(),'clinical_assessment':False}

async def consent(db,learner_id):
    value=await require_practice_consent(db,learner_id)
    if not value.retain_audio_allowed:raise HTTPException(403,'Private retention permission is required for saved demonstrations')

def validate(data,media_type):
    try:
        decode_audio(data)
        if media_type.startswith('video/'):
            import av
            with av.open(io.BytesIO(data)) as container:
                if not container.streams.video:raise ValueError('No video')
    except (InvalidAudioError,ValueError) as error:raise HTTPException(422,'Use a playable spoken example, up to 60 seconds, with audio.') from error

@router.get('/learners/{learner_id}/demonstrations')
async def listing(learner_id:uuid.UUID,target:str='',user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    await accessible_learner(db,user,learner_id);await consent(db,learner_id)
    query=select(LearningDemonstration).where(LearningDemonstration.learner_id==learner_id)
    if target:query=query.where(func.lower(LearningDemonstration.target)==target.strip().casefold())
    rows=(await db.execute(query.order_by(LearningDemonstration.created_at.desc()).limit(30))).scalars().all()
    return [public(row) for row in rows]

@router.post('/learners/{learner_id}/demonstrations',status_code=201)
async def upload(learner_id:uuid.UUID,target:str=Form(...,min_length=1,max_length=120),
    adult_permission:bool=Form(...),media:UploadFile=File(...),
    user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    await accessible_learner(db,user,learner_id);await consent(db,learner_id)
    target=target.strip()
    if not target:raise HTTPException(422,'Choose a word or phrase for this example')
    if not adult_permission:raise HTTPException(422,'Permission from the adult demonstrating is required')
    media_type=(media.content_type or '').split(';')[0]
    if media_type not in TYPES:raise HTTPException(422,'Choose an audio or video example')
    data=await media.read(20*1024*1024+1)
    if not data or len(data)>20*1024*1024:raise HTTPException(413,'Example must be nonempty and no larger than 20 MB')
    await run_in_threadpool(validate,data,media_type)
    await consent(db,learner_id)
    key=await run_in_threadpool(storage.retain,data)
    row=LearningDemonstration(learner_id=learner_id,author_id=user.id,target=target.strip(),storage_key=key,media_type=media_type,
        status='clinician_authored' if await is_clinician(db,user.id) else 'family_example')
    try:db.add(row);await db.commit()
    except Exception:
        await db.rollback();await run_in_threadpool(storage.remove,key);raise
    return public(row)

async def access(db,user,identifier):
    row=await db.get(LearningDemonstration,identifier)
    if not row:raise HTTPException(404,'Example not found')
    learner=await accessible_learner(db,user,row.learner_id)
    return row,learner

@router.get('/demonstrations/{identifier}/media')
async def media(identifier:uuid.UUID,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    row,_=await access(db,user,identifier);await consent(db,row.learner_id)
    data=await run_in_threadpool(storage.read,row.storage_key)
    return Response(data,media_type=row.media_type,headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})

@router.delete('/demonstrations/{identifier}')
async def remove(identifier:uuid.UUID,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    row,learner=await access(db,user,identifier)
    if user.id not in [row.author_id,learner.owner_id]:raise HTTPException(403,'Only the family or author can remove this example')
    db.add(StorageDeletion(storage_key=row.storage_key));await db.delete(row);await db.commit()
    return {'deleted':True}

class DemonstrationReview(BaseModel):
    model_config=ConfigDict(extra='forbid')
    approved:bool

@router.put('/demonstrations/{identifier}/review')
async def review(identifier:uuid.UUID,payload:DemonstrationReview,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    row,_=await access(db,user,identifier);await consent(db,row.learner_id)
    assigned=(await db.execute(select(ClinicianAssignment.id).where(ClinicianAssignment.learner_id==row.learner_id,
        ClinicianAssignment.clinician_id==user.id,ClinicianAssignment.active.is_(True)))).scalar_one_or_none()
    if not await is_clinician(db,user.id) or not assigned:raise HTTPException(403,'Assigned clinician review required')
    row.status='clinician_approved' if payload.approved else 'needs_revision';row.reviewed_by=user.id
    await db.commit();return public(row)
