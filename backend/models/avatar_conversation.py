import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey, JSON, Uuid
from database import Base

class AvatarConversation(Base):
    __tablename__ = "avatar_conversations"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=True)
    session_id = Column(Uuid, ForeignKey("practice_sessions.id", ondelete="SET NULL"), nullable=True)
    messages = Column(JSON, default=list)  # list of {role, content, timestamp}
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
