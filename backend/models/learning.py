"""Durable educational activity evidence; never a speech accuracy score."""
import uuid
from sqlalchemy import Column,String,DateTime,ForeignKey,JSON,Uuid,Integer
from database import Base
from models.care import now

class LearningSession(Base):
    __tablename__='learner_learning_sessions'
    id=Column(Uuid,primary_key=True,default=uuid.uuid4)
    learner_id=Column(Uuid,ForeignKey('learners.id',ondelete='CASCADE'),nullable=False,index=True)
    started_by=Column(Uuid,ForeignKey('profiles.id'),nullable=False)
    kind=Column(String(30),nullable=False)
    target=Column(String(120),nullable=False)
    content=Column(JSON,nullable=False)
    events=Column(JSON,nullable=False,default=list)
    position=Column(Integer,nullable=False,default=0)
    status=Column(String(20),nullable=False,default='active')
    created_at=Column(DateTime(timezone=True),nullable=False,default=now)
    updated_at=Column(DateTime(timezone=True),nullable=False,default=now)

class LearningDemonstration(Base):
    __tablename__='learner_demonstrations'
    id=Column(Uuid,primary_key=True,default=uuid.uuid4)
    learner_id=Column(Uuid,ForeignKey('learners.id',ondelete='CASCADE'),nullable=False,index=True)
    author_id=Column(Uuid,ForeignKey('profiles.id'),nullable=False)
    target=Column(String(120),nullable=False)
    storage_key=Column(String(80),nullable=False)
    media_type=Column(String(60),nullable=False)
    status=Column(String(20),nullable=False,default='family_example')
    reviewed_by=Column(Uuid,ForeignKey('profiles.id'),nullable=True)
    created_at=Column(DateTime(timezone=True),nullable=False,default=now)
