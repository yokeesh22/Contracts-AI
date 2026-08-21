from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import case, func
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

    # Which positions counterparties push back on most often, across every
    # contract reviewed. Over time this is the read on where the playbook is
    # actually being tested, and where negotiating effort goes.
    pressure_rows = (
        db.query(
            Redline.clause_type,
            func.count(Redline.id).label("total"),
            func.sum(
                case((Redline.classification == "UNACCEPTABLE", 1), else_=0)
            ).label("severe"),
        )
        .filter(Redline.clause_type.isnot(None))
        .group_by(Redline.clause_type)
        .order_by(func.count(Redline.id).desc())
        .limit(8)
        .all()
    )

    # Daily activity for the trend chart. Buckets are built in Python rather
    # than with SQL date functions so the query stays portable off SQLite, and
    # empty days are filled in - a line chart that silently skips quiet days
    # misrepresents the trend.
    window_days = 30
    today = datetime.utcnow().date()
    start = today - timedelta(days=window_days - 1)

    buckets = {
        start + timedelta(days=i): {"reviews": 0, "findings": 0, "high_risk": 0}
        for i in range(window_days)
    }

    for (created,) in db.query(ContractReview.created_at).filter(
        ContractReview.created_at.isnot(None)
    ):
        day = created.date()
        if day in buckets:
            buckets[day]["reviews"] += 1

    for created, classification in db.query(
        Redline.created_at, Redline.classification
    ).filter(Redline.created_at.isnot(None)):
        day = created.date()
        if day in buckets:
            buckets[day]["findings"] += 1
            if classification in ("UNACCEPTABLE", "MISSING"):
                buckets[day]["high_risk"] += 1

    activity_series = [
        {
            "date": day.isoformat(),
            "label": day.strftime("%d %b"),
            **counts,
        }
        for day, counts in sorted(buckets.items())
    ]

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
        "activity_series": activity_series,
        "clause_pressure": [
            {
                "clause_type": ctype,
                "total": total,
                "severe": int(severe or 0),
            }
            for ctype, total, severe in pressure_rows
        ],
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
