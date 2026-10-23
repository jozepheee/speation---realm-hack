import uuid
from sqlalchemy import Column,Uuid,String,JSON,DateTime,ForeignKey,UniqueConstraint
from database import Base
from models.care import now

class AICareReport(Base):
    __tablename__='ai_care_reports'
    id=Column(Uuid,primary_key=True,default=uuid.uuid4)
    learner_id=Column(Uuid,ForeignKey('learners.id',ondelete='CASCADE'),nullable=False,index=True)
    fingerprint=Column(String(64),nullable=False)
    model=Column(String(100),nullable=False)
    content=Column(JSON,nullable=False)
    metrics=Column(JSON,nullable=False)
    status=Column(String(30),nullable=False,default='awaiting_clinician')
    reviewed_by=Column(Uuid,ForeignKey('profiles.id'),nullable=True)
    review_note=Column(String(2000),nullable=True)
    reviewed_at=Column(DateTime(timezone=True),nullable=True)
    created_at=Column(DateTime(timezone=True),nullable=False,default=now)
    __table_args__=(UniqueConstraint('learner_id','fingerprint',name='care_report_snapshot_unique'),)
