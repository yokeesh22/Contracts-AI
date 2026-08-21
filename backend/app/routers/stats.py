from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import Specification, AnalysisSession, Requirement

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("")
def get_stats(db: Session = Depends(get_db)):
    total_specs = db.query(func.count(Specification.id)).scalar() or 0
    completed_specs = (
        db.query(func.count(Specification.id))
        .filter(Specification.extraction_status == "completed")
        .scalar() or 0
    )
    total_sessions = db.query(func.count(AnalysisSession.id)).scalar() or 0
    completed_sessions = (
        db.query(func.count(AnalysisSession.id))
        .filter(AnalysisSession.status == "completed")
        .scalar() or 0
    )
    total_requirements = db.query(func.count(Requirement.id)).scalar() or 0

    # Classification breakdown
    classifications = {}
    rows = (
        db.query(Requirement.classification, func.count(Requirement.id))
        .group_by(Requirement.classification)
        .all()
    )
    for cls, cnt in rows:
        classifications[cls or "NOT_APPLICABLE"] = cnt

    # Recent 5 sessions
    recent = (
        db.query(AnalysisSession)
        .order_by(AnalysisSession.created_at.desc())
        .limit(5)
        .all()
    )
    recent_sessions = [
        {
            "id": s.id,
            "urs_name": s.urs_name,
            "status": s.status,
            "total_requirements": s.total_requirements,
            "analyzed_count": s.analyzed_count,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in recent
    ]

    return {
        "total_specifications": total_specs,
        "completed_specifications": completed_specs,
        "total_analyses": total_sessions,
        "completed_analyses": completed_sessions,
        "total_requirements": total_requirements,
        "classifications": {
            "COMPLIANT": classifications.get("COMPLIANT", 0),
            "ACCEPTABLE_DEVIATION": classifications.get("ACCEPTABLE_DEVIATION", 0),
            "CRITICAL_DEVIATION": classifications.get("CRITICAL_DEVIATION", 0),
            "NOT_APPLICABLE": classifications.get("NOT_APPLICABLE", 0),
        },
        "recent_sessions": recent_sessions,
    }
