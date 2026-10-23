import uuid
from sqlalchemy import Column,Uuid,String,Integer,Boolean,DateTime,ForeignKey,UniqueConstraint
from database import Base
from models.care import now

class JourneyCosmetic(Base):
    __tablename__='journey_cosmetics'
    id=Column(Uuid,primary_key=True,default=uuid.uuid4)
    learner_id=Column(Uuid,ForeignKey('learners.id',ondelete='CASCADE'),nullable=False,index=True)
    item_id=Column(String(30),nullable=False)
    paid_price=Column(Integer,nullable=False)
    equipped=Column(Boolean,nullable=False,default=False)
    created_at=Column(DateTime(timezone=True),nullable=False,default=now)
    __table_args__=(UniqueConstraint('learner_id','item_id',name='journey_cosmetic_once'),)
