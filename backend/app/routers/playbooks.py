from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ContractReview, Playbook, PlaybookRule
from ..schemas import (
    PlaybookCreate,
    PlaybookDetail,
    PlaybookOut,
    PlaybookRuleCreate,
    PlaybookRuleOut,
    PlaybookRuleUpdate,
    PlaybookUpdate,
)

router = APIRouter(prefix="/playbooks", tags=["playbooks"])


def _with_count(playbook: Playbook) -> dict:
    data = {
        "id": playbook.id,
        "name": playbook.name,
        "description": playbook.description,
        "our_party": playbook.our_party,
        "is_default": playbook.is_default,
        "created_at": playbook.created_at,
        "updated_at": playbook.updated_at,
        "rule_count": len([r for r in playbook.rules if r.is_active]),
    }
    return data


@router.get("", response_model=list[PlaybookOut])
def list_playbooks(db: Session = Depends(get_db)):
    playbooks = (
        db.query(Playbook)
        .order_by(Playbook.is_default.desc(), Playbook.created_at.desc())
        .all()
    )
    return [_with_count(p) for p in playbooks]


@router.post("", response_model=PlaybookOut, status_code=201)
def create_playbook(payload: PlaybookCreate, db: Session = Depends(get_db)):
    playbook = Playbook(**payload.model_dump())
    db.add(playbook)
    db.commit()
    db.refresh(playbook)
    return _with_count(playbook)


@router.get("/{playbook_id}", response_model=PlaybookDetail)
def get_playbook(playbook_id: int, db: Session = Depends(get_db)):
    playbook = db.query(Playbook).filter(Playbook.id == playbook_id).first()
    if not playbook:
        raise HTTPException(404, "Playbook not found")
    data = _with_count(playbook)
    data["rules"] = playbook.rules
    return data


@router.patch("/{playbook_id}", response_model=PlaybookOut)
def update_playbook(
    playbook_id: int, payload: PlaybookUpdate, db: Session = Depends(get_db)
):
    playbook = db.query(Playbook).filter(Playbook.id == playbook_id).first()
    if not playbook:
        raise HTTPException(404, "Playbook not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(playbook, field, value)
    db.commit()
    db.refresh(playbook)
    return _with_count(playbook)


@router.delete("/{playbook_id}", status_code=204)
def delete_playbook(playbook_id: int, db: Session = Depends(get_db)):
    playbook = db.query(Playbook).filter(Playbook.id == playbook_id).first()
    if not playbook:
        raise HTTPException(404, "Playbook not found")
    if playbook.is_default:
        raise HTTPException(400, "The default playbook cannot be deleted.")
    in_use = (
        db.query(ContractReview).filter(ContractReview.playbook_id == playbook_id).count()
    )
    if in_use:
        # Reviews cite the rule that produced each finding; deleting the
        # playbook would strand that audit trail.
        raise HTTPException(
            400,
            f"This playbook is used by {in_use} review(s). Delete those reviews first.",
        )
    db.delete(playbook)
    db.commit()


# ------------------------------------------------------------------- rules
@router.get("/{playbook_id}/rules", response_model=list[PlaybookRuleOut])
def list_rules(playbook_id: int, db: Session = Depends(get_db)):
    if not db.query(Playbook).filter(Playbook.id == playbook_id).first():
        raise HTTPException(404, "Playbook not found")
    return (
        db.query(PlaybookRule)
        .filter(PlaybookRule.playbook_id == playbook_id)
        .order_by(PlaybookRule.sort_order)
        .all()
    )


@router.post("/{playbook_id}/rules", response_model=PlaybookRuleOut, status_code=201)
def create_rule(
    playbook_id: int, payload: PlaybookRuleCreate, db: Session = Depends(get_db)
):
    if not db.query(Playbook).filter(Playbook.id == playbook_id).first():
        raise HTTPException(404, "Playbook not found")
    rule = PlaybookRule(playbook_id=playbook_id, **payload.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.patch("/{playbook_id}/rules/{rule_id}", response_model=PlaybookRuleOut)
def update_rule(
    playbook_id: int,
    rule_id: int,
    payload: PlaybookRuleUpdate,
    db: Session = Depends(get_db),
):
    rule = (
        db.query(PlaybookRule)
        .filter(PlaybookRule.id == rule_id, PlaybookRule.playbook_id == playbook_id)
        .first()
    )
    if not rule:
        raise HTTPException(404, "Rule not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{playbook_id}/rules/{rule_id}", status_code=204)
def delete_rule(playbook_id: int, rule_id: int, db: Session = Depends(get_db)):
    rule = (
        db.query(PlaybookRule)
        .filter(PlaybookRule.id == rule_id, PlaybookRule.playbook_id == playbook_id)
        .first()
    )
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()
