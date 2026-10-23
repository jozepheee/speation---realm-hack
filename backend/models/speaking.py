import uuid
from sqlalchemy import Column,String,Integer,ForeignKey,JSON,DateTime,Uuid
from database import Base
from models.care import now


class SpeakingMaterial(Base):
    __tablename__='speaking_materials'
    id=Column(Uuid,primary_key=True,default=uuid.uuid4)
    learner_id=Column(Uuid,ForeignKey('learners.id',ondelete='CASCADE'),nullable=False,index=True)
    created_by=Column(Uuid,ForeignKey('profiles.id'),nullable=False)
    title=Column(String(160),nullable=False)
    kind=Column(String(10),nullable=False)
    language=Column(String(2),nullable=False)
    storage_key=Column(String(80),nullable=False)
    preview_key=Column(String(80))
    sections=Column(JSON,nullable=False)
    resume_profile=Column(JSON)
    confirmed_at=Column(DateTime(timezone=True))
    created_at=Column(DateTime(timezone=True),nullable=False,default=now)


class SpeakingRehearsal(Base):
    __tablename__='speaking_rehearsals'
    id=Column(Uuid,primary_key=True,default=uuid.uuid4)
    learner_id=Column(Uuid,ForeignKey('learners.id',ondelete='CASCADE'),nullable=False,index=True)
    created_by=Column(Uuid,ForeignKey('profiles.id'),nullable=False)
    material_id=Column(Uuid,ForeignKey('speaking_materials.id',ondelete='CASCADE'))
    scenario=Column(String(20),nullable=False)
    language=Column(String(2),nullable=False)
    status=Column(String(16),nullable=False,default='active')
    position=Column(Integer,nullable=False,default=0)
    content=Column(JSON,nullable=False)
    report=Column(JSON)
    created_at=Column(DateTime(timezone=True),nullable=False,default=now)
    completed_at=Column(DateTime(timezone=True))


class SpeakingWord(Base):
    __tablename__='speaking_words'
    id=Column(Uuid,primary_key=True,default=uuid.uuid4)
    learner_id=Column(Uuid,ForeignKey('learners.id',ondelete='CASCADE'),nullable=False,index=True)
    word=Column(String(100),nullable=False)
    language=Column(String(2),nullable=False)
    context=Column(String(600),nullable=False,default='')
    history=Column(JSON,nullable=False,default=list)
    created_at=Column(DateTime(timezone=True),nullable=False,default=now)
