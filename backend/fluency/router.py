from uuid import UUID
from typing import Literal
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool
from database import get_db
from models.fluency_score import FluencyScore
from models.user import User
from schemas.fluency import FluencyScoreResponse
from fluency.scorer import run_fluency_pipeline
from fluency.fusion import get_fusion_model
from auth.dependencies import get_current_user
from ml_settings import InvalidAudioError,ModelUnavailableError,MAX_AUDIO_BYTES
from scheduler.service import complete_transition, validate_session
router=APIRouter(tags=['fluency'])

@router.get('/status')
async def scoring_status():
    try:
        _,meta,_=await run_in_threadpool(get_fusion_model)
        return {'ready':True,'model_version':meta['run_id'],'score_kind':meta['score_kind']}
    except ModelUnavailableError as exc:
        return {'ready':False,'reason':str(exc)}

@router.post('/score',response_model=FluencyScoreResponse)
async def score_audio(audio:UploadFile=File(...),target_text:str=Form(''),
                      mode:Literal['companion','qa','reading','roleplay','stress_test']=Form('reading'),
                      difficulty:int=Form(1,ge=1,le=3),trajectory_id:UUID|None=Form(None),
                      current_user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    if len(target_text)>5000: raise HTTPException(422,'Reference text is too long')
    await validate_session(db,current_user.id,trajectory_id,mode,difficulty)
    data=await audio.read(MAX_AUDIO_BYTES+1)
    try:
        results=await run_in_threadpool(run_fluency_pipeline,data,target_text)
    except InvalidAudioError as exc: raise HTTPException(422,str(exc))
    except ModelUnavailableError as exc: raise HTTPException(503,str(exc))
    results['features'].update(mode=mode,session_type=mode,difficulty=difficulty,trajectory_id=str(trajectory_id) if trajectory_id else None)
    score=FluencyScore(user_id=current_user.id,transcript=results['transcript'],
                       acoustic_score=results['acoustic'],semantic_score=results['semantic'],
                       composite_score=results['composite'],features=results['features'])
    db.add(score); await db.flush()
    if trajectory_id: await complete_transition(db,current_user.id,trajectory_id,score)
    current_user.fluency_level=results['composite']
    await db.commit()
    return FluencyScoreResponse(**results,score_id=str(score.id))
