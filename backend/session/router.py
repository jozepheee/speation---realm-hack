from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List, Dict, Any, Optional
from database import get_db
from models.fluency_score import FluencyScore
from models.session import PracticeSession
from models.user import User
from auth.dependencies import get_optional_current_user, get_current_user

router = APIRouter(tags=["session"])

class RecordSessionRequest(BaseModel):
    session_type: str
    composite_score: float
    acoustic_score: Optional[float] = None
    semantic_score: Optional[float] = None
    transcript: Optional[str] = None
    duration_secs: Optional[int] = 30
    features: Optional[Dict[str, Any]] = None

def compute_authentic_streak(dates: List[datetime]) -> int:
    """
    Computes genuine consecutive-day streak ending today or yesterday.
    """
    if not dates:
        return 0
    
    unique_days = {d.date() for d in dates if d is not None}
    if not unique_days:
        return 0

    today = datetime.now(timezone.utc).date()
    yesterday = today - timedelta(days=1)

    # Streak is active if user practiced today or yesterday
    if today in unique_days:
        curr = today
    elif yesterday in unique_days:
        curr = yesterday
    else:
        return 0

    streak = 0
    while curr in unique_days:
        streak += 1
        curr -= timedelta(days=1)
    
    return streak

@router.post("/record")
async def record_practice_session(
    payload: RecordSessionRequest,
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Records a completed speech practice session into the live database.
    """
    user_id = current_user.id if current_user else None

    # 1. Create PracticeSession record
    session_rec = PracticeSession(
        user_id=user_id,
        session_type=payload.session_type,
        duration_secs=payload.duration_secs or 30,
        difficulty=1
    )
    db.add(session_rec)
    await db.flush()

    # 2. Create FluencyScore record
    features_payload = dict(payload.features or {})
    features_payload["source"] = "legacy_client_record"
    features_payload["session_type"] = payload.session_type

    score_rec = FluencyScore(
        session_id=session_rec.id,
        user_id=user_id,
        transcript=payload.transcript or "",
        acoustic_score=payload.acoustic_score or payload.composite_score,
        semantic_score=payload.semantic_score or payload.composite_score,
        composite_score=payload.composite_score,
        features=features_payload
    )
    db.add(score_rec)

    # 3. Update user rolling fluency and streak if user is logged in
    if current_user:
        # Fetch all session dates to recompute true streak
        dates_query = select(FluencyScore.recorded_at).where(FluencyScore.user_id == current_user.id)
        res = await db.execute(dates_query)
        dates = res.scalars().all()
        dates_list = list(dates) + [datetime.now(timezone.utc)]
        
        current_user.streak = compute_authentic_streak(dates_list)
        # Client-supplied exercise scores do not update measured audio fluency.

        db.add(current_user)

    await db.commit()

    return {
        "status": "success",
        "session_id": str(session_rec.id),
        "score_id": str(score_rec.id),
        "streak": current_user.streak if current_user else 1,
        "fluency_level": current_user.fluency_level if current_user else None
    }

@router.get("/history")
async def get_session_history(
    current_user: User | None = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(FluencyScore).order_by(desc(FluencyScore.recorded_at)).limit(30)
    if current_user:
        query = select(FluencyScore).where(FluencyScore.user_id == current_user.id, FluencyScore.features["source"].as_string() == "multimodal_v3").order_by(desc(FluencyScore.recorded_at))

    result = await db.execute(query)
    scores = result.scalars().all()
    if scores:
        version=scores[0].features.get('model_version')
        scores=[s for s in scores if s.features.get('model_version')==version]

    formatted = []
    for s in scores:
        # Determine actual session type from features or transcript
        s_type = "Oral & Breath Control"
        if s.features and isinstance(s.features, dict) and s.features.get("session_type"):
            s_type = s.features["session_type"]
        elif s.transcript and len(s.transcript) > 0:
            s_type = "3D AI Character Conversation"

        formatted.append({
            "id": str(s.id),
            "session_type": s_type,
            "composite_score": round(s.composite_score, 1),
            "acoustic_score": round(s.acoustic_score, 1) if s.acoustic_score is not None else None,
            "acoustic_weight": s.features.get('acoustic_weight'),
            "semantic_weight": s.features.get('semantic_weight'),
            "semantic_score": round(s.semantic_score, 1) if s.semantic_score is not None else None,
            "transcript": s.transcript,
            "recorded_at": s.recorded_at.isoformat() if s.recorded_at else None
        })

    # Calculate real-time overall stats
    total_sessions = len(scores)
    all_dates = [s.recorded_at for s in scores if s.recorded_at]
    real_streak = compute_authentic_streak(all_dates)
    latest_score = round(scores[0].composite_score, 1) if scores else 0.0
    avg_score = round(sum(s.composite_score for s in scores) / total_sessions, 1) if total_sessions > 0 else 0.0

    return {
        "sessions": formatted,
        "stats": {
            "total_sessions": total_sessions,
            "streak": real_streak,
            "latest_score": latest_score,
            "average_score": avg_score
        }
    }

@router.get("/realtime-metrics")
async def get_realtime_metrics(current_user: User = Depends(get_current_user),
                               db: AsyncSession = Depends(get_db)):
    from scheduler.service import user_history
    from scheduler.router import recommend
    scores, actions = await user_history(db, current_user.id)
    values = [s.composite_score for s in scores]
    policy, reason = None, None
    if values:
        try:
            policy = await recommend(values, actions, 1, len(scores))
        except HTTPException as exc:
            reason = exc.detail
    else:
        reason = "Complete a recording with the trained scorer to establish a baseline."
    return {"fluency_history": values[-30:], "mode_history": actions[-30:],
            "fluency_level": values[-1] if values else None,
            "streak": compute_authentic_streak([s.recorded_at for s in scores]),
            "total_sessions": len(scores), "policy": policy, "reason": reason}
