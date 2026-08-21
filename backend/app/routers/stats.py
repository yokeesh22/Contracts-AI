from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ContractReview, Playbook, PlaybookRule, Redline

router = APIRouter(prefix="/stats", tags=["stats"])

CLASSIFICATIONS = ("UNACCEPTABLE", "MISSING", "NEGOTIABLE", "ACCEPTABLE")


@router.get("")
def get_stats(db: Session = Depends(get_db)):
    total_playbooks = db.query(func.count(Playbook.id)).scalar() or 0
    total_rules = (
        db.query(func.count(PlaybookRule.id))
        .filter(PlaybookRule.is_active.is_(True))
        .scalar()
        or 0
    )
    total_reviews = db.query(func.count(ContractReview.id)).scalar() or 0
    completed_reviews = (
        db.query(func.count(ContractReview.id))
        .filter(ContractReview.status == "completed")
        .scalar()
        or 0
    )
    total_redlines = db.query(func.count(Redline.id)).scalar() or 0

    rows = (
        db.query(Redline.classification, func.count(Redline.id))
        .group_by(Redline.classification)
        .all()
    )
    found = {cls or "NEGOTIABLE": count for cls, count in rows}

    # How much of the AI's work reviewers actually keep. The most honest signal
    # of whether the playbook is tuned to how this team really negotiates.
    status_rows = (
        db.query(Redline.status, func.count(Redline.id))
        .group_by(Redline.status)
        .all()
    )
    by_status = {status: count for status, count in status_rows}

    recent = (
        db.query(ContractReview)
        .order_by(ContractReview.created_at.desc())
        .limit(5)
        .all()
    )

    return {
        "total_playbooks": total_playbooks,
        "total_rules": total_rules,
        "total_reviews": total_reviews,
        "completed_reviews": completed_reviews,
        "total_redlines": total_redlines,
        "classifications": {c: found.get(c, 0) for c in CLASSIFICATIONS},
        "redline_status": {
            "suggested": by_status.get("suggested", 0),
            "accepted": by_status.get("accepted", 0),
            "rejected": by_status.get("rejected", 0),
            "modified": by_status.get("modified", 0),
        },
        "recent_reviews": [
            {
                "id": r.id,
                "name": r.name,
                "counterparty": r.counterparty,
                "status": r.status,
                "doc_kind": r.doc_kind,
                "total_clauses": r.total_clauses,
                "analyzed_count": r.analyzed_count,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in recent
        ],
    }
