"""Phoniverse-inspired exploration and cosmetics; rewards are participation only."""
import uuid
from fastapi import APIRouter,Depends,HTTPException
from sqlalchemy import select,func,distinct,update
from sqlalchemy.ext.asyncio import AsyncSession
from auth.dependencies import get_current_user
from database import get_db
from models.user import User
from models.care import SpeechRecording
from models.journey import JourneyCosmetic
from learners.access import accessible_learner,lock_learner,require_practice_consent

router=APIRouter(tags=['speech-journey'])
CATALOG=[
 {'id':'beanie','name':'Beanie','file':'Beanie.png','price':50,'slot':'head'},
 {'id':'chain','name':'Chain','file':'goldchain.png','price':75,'slot':'neck'},
 {'id':'cowboy','name':'Cowboy Hat','file':'cowboyhat.png','price':100,'slot':'head'},
 {'id':'headphones','name':'Headphones','file':'headphones.png','price':80,'slot':'head'},
 {'id':'purse','name':'Purse','file':'Purse.png','price':60,'slot':'hands'},
 {'id':'scarf','name':'Scarf','file':'scarf.png','price':40,'slot':'neck'},
 {'id':'spin','name':'Spin Hat','file':'spinhat.png','price':90,'slot':'head'},
 {'id':'glasses','name':'Sunglasses','file':'Sunglasses.png','price':70,'slot':'head'},
 {'id':'tie','name':'Tie','file':'tie.png','price':55,'slot':'neck'},
 {'id':'top-hat','name':'Top Hat','file':'tophat.png','price':120,'slot':'head'},
]

async def snapshot(db,learner_id):
    # One word per day earns once; retries never cost points. Daily cap avoids
    # encouraging a child to grind through recordings to collect cosmetics.
    daily=(await db.execute(select(func.date(SpeechRecording.created_at),func.count(distinct(func.lower(SpeechRecording.expected_text)))).where(SpeechRecording.learner_id==learner_id,SpeechRecording.language=='en',SpeechRecording.expected_text!='',SpeechRecording.recognition_error.is_(None),SpeechRecording.duration_seconds>=.15).group_by(func.date(SpeechRecording.created_at)))).all()
    earned=sum(min(5,count)*10 for _,count in daily)
    owned=(await db.execute(select(JourneyCosmetic).where(JourneyCosmetic.learner_id==learner_id))).scalars().all()
    return {'earned':earned,'balance':max(0,earned-sum(item.paid_price for item in owned)),'practice_days':len(daily),'practice_words':sum(count for _,count in daily),'owned':[item.item_id for item in owned],'equipped':[item.item_id for item in owned if item.equipped],'catalog':CATALOG,'reward_basis':'participation_not_speech_accuracy','daily_word_limit':5}

@router.get('/learners/{learner_id}/journey')
async def journey(learner_id:uuid.UUID,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    await accessible_learner(db,user,learner_id,owner_only=True);await require_practice_consent(db,learner_id)
    return await snapshot(db,learner_id)

@router.post('/learners/{learner_id}/journey/items/{item_id}')
async def purchase(learner_id:uuid.UUID,item_id:str,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    await lock_learner(db,user,learner_id,owner_only=True);await require_practice_consent(db,learner_id)
    item=next((item for item in CATALOG if item['id']==item_id),None)
    if not item:raise HTTPException(404,'Cosmetic not found')
    status=await snapshot(db,learner_id)
    if item_id not in status['owned']:
        if status['balance']<item['price']:raise HTTPException(409,'Keep practising on another day to earn this item')
        db.add(JourneyCosmetic(learner_id=learner_id,item_id=item_id,paid_price=item['price']));await db.commit()
    return await snapshot(db,learner_id)

@router.put('/learners/{learner_id}/journey/equipped/{item_id}')
async def equip(learner_id:uuid.UUID,item_id:str,user:User=Depends(get_current_user),db:AsyncSession=Depends(get_db)):
    await lock_learner(db,user,learner_id,owner_only=True);await require_practice_consent(db,learner_id)
    item=next((item for item in CATALOG if item['id']==item_id),None)
    row=(await db.execute(select(JourneyCosmetic).where(JourneyCosmetic.learner_id==learner_id,JourneyCosmetic.item_id==item_id))).scalar_one_or_none()
    if not item or not row:raise HTTPException(404,'Owned cosmetic not found')
    same_slot=[entry['id'] for entry in CATALOG if entry['slot']==item['slot']]
    next_value=not row.equipped
    await db.execute(update(JourneyCosmetic).where(JourneyCosmetic.learner_id==learner_id,JourneyCosmetic.item_id.in_(same_slot)).values(equipped=False))
    row.equipped=next_value;await db.commit()
    return await snapshot(db,learner_id)
