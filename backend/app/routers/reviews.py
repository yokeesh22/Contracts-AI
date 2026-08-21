import json
import os
import shutil
import uuid
from datetime import datetime

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal, get_db
from ..models import ContractReview, Playbook, PlaybookRule, Redline
from ..schemas import (
    ContractReviewDetail,
    ContractReviewOut,
    RedlineCreate,
    RedlineOut,
    RedlineUpdate,
)
from ..services.diff_util import change_summary, diff_ops
from ..services.document_model import (
    blocks_to_text,
    dump_blocks,
    extract_blocks,
    load_blocks,
    sections_of,
)
from ..services.redline_engine import (
    assess_clause,
    find_missing,
    group_hits,
    locate_clauses,
)
from ..services.redline_export import export_redline_docx
from ..services.summary_export import generate_issues_list_docx

router = APIRouter(prefix="/reviews", tags=["reviews"])

ALLOWED_EXTENSIONS = {".pdf", ".docx"}
# .doc is deliberately excluded: the block model needs OOXML paragraph
# positions, which the legacy binary format does not provide.

MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

DOCX_MEDIA = MEDIA_TYPES[".docx"]

# Order findings by how much they matter, not by where they appear.
SEVERITY_ORDER = {"UNACCEPTABLE": 0, "MISSING": 1, "NEGOTIABLE": 2, "ACCEPTABLE": 3}


def _save_upload(upload: UploadFile) -> tuple[str, str, str]:
    ext = os.path.splitext(upload.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400,
            f"Unsupported file type '{ext}'. Upload a .docx or .pdf contract.",
        )
    unique_name = f"{uuid.uuid4().hex}{ext}"
    dest = os.path.join(settings.upload_dir, "contracts", unique_name)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as f:
        shutil.copyfileobj(upload.file, f)
    return upload.filename or unique_name, dest, ext.lstrip(".")


def _run_review(review_id: int):
    """Background task. Sync on purpose: Starlette runs sync background tasks
    in a worker thread, so the blocking Azure calls do not stall the event
    loop and freeze every other request."""
    db: Session = SessionLocal()
    try:
        review = db.query(ContractReview).filter(ContractReview.id == review_id).first()
        if not review:
            return

        rules = (
            db.query(PlaybookRule)
            .filter(
                PlaybookRule.playbook_id == review.playbook_id,
                PlaybookRule.is_active.is_(True),
            )
            .order_by(PlaybookRule.sort_order)
            .all()
        )
        if not rules:
            review.status = "failed"
            review.error_message = (
                "The selected playbook has no active rules. Add rules in the "
                "Playbook Manager before running a review."
            )
            db.commit()
            return

        # Step 1 - build the block model both the viewer and the export use.
        review.status = "extracting"
        db.commit()
        blocks, doc_kind = extract_blocks(review.file_path)
        if not blocks:
            review.status = "failed"
            review.error_message = (
                "No readable text found. If this is a scanned PDF it needs OCR "
                "before it can be reviewed."
            )
            db.commit()
            return
        review.blocks_json = dump_blocks(blocks)
        review.doc_kind = doc_kind
        review.extracted_text = blocks_to_text(blocks)
        db.commit()

        # Step 2 - locate the clauses we hold positions on.
        review.status = "analyzing"
        db.commit()
        rules_by_type = {r.clause_type: r for r in rules}
        hits = locate_clauses(blocks, list(rules_by_type.keys()))
        # One clause, one edit — even where several positions bear on it. Two
        # edits to the same paragraph cannot both survive into the exported
        # document, and the clause gets negotiated as a single conversation.
        groups = group_hits(hits)
        review.total_clauses = len(groups)
        db.commit()

        # Step 3 - judge each clause and draft its replacement.
        order = 0
        for group in groups:
            matched = [
                rules_by_type[t] for t in group["clause_types"] if t in rules_by_type
            ]
            if not matched:
                continue
            result = assess_clause(group["text"], matched)

            failed = result["failed_positions"] or group["clause_types"]
            # The primary position is the most severe one the clause failed;
            # it drives the label and the link back into the playbook.
            primary = min(
                (r for r in matched if r.clause_type in failed),
                key=lambda r: SEVERITY_ORDER.get(r.severity, 9),
                default=matched[0],
            )
            db.add(
                Redline(
                    review_id=review_id,
                    sort_order=order,
                    doc_section=group.get("section"),
                    clause_ref=group.get("clause_ref"),
                    clause_title=group.get("clause_title") or primary.title,
                    block_start=group["block_start"],
                    block_end=group["block_end"],
                    page=group.get("page"),
                    clause_type=primary.clause_type,
                    covers=json.dumps(failed),
                    rule_id=primary.id,
                    original_text=group["text"],
                    proposed_text=result["proposed_text"],
                    classification=result["classification"],
                    rationale=result["rationale"],
                    status="suggested",
                    source="ai",
                )
            )
            order += 1
            review.analyzed_count = order
            db.commit()

        # Step 4 - required protections with no clause anywhere in the contract.
        found_types = {t for h in hits for t in [h["clause_type"]]}
        for gap in find_missing(found_types, rules):
            db.add(
                Redline(
                    review_id=review_id,
                    sort_order=order,
                    doc_section=None,
                    clause_title=gap["rule"].title,
                    clause_type=gap["clause_type"],
                    covers=json.dumps([gap["clause_type"]]),
                    rule_id=gap["rule"].id,
                    original_text="",
                    proposed_text=gap["proposed_text"],
                    classification="MISSING",
                    rationale=gap["rationale"],
                    status="suggested",
                    source="ai",
                )
            )
            order += 1

        review.total_clauses = order
        review.analyzed_count = order
        review.status = "completed"
        review.completed_at = datetime.utcnow()
        db.commit()

    except Exception as exc:
        try:
            review = (
                db.query(ContractReview).filter(ContractReview.id == review_id).first()
            )
            if review:
                review.status = "failed"
                review.error_message = str(exc)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def _serialise_redline(redline: Redline) -> dict:
    """Attach the derived diff. Computed per request so a user's edit shows up
    immediately and matches what the exporter will write."""
    data = {
        c.name: getattr(redline, c.name) for c in redline.__table__.columns
    }
    original = redline.original_text or ""
    proposed = redline.proposed_text or ""

    if redline.status == "rejected" or not proposed:
        data["diff"] = []
        data["words_added"] = 0
        data["words_removed"] = 0
    else:
        data["diff"] = diff_ops(original, proposed)
        data.update(change_summary(original, proposed))

    try:
        data["covers"] = json.loads(redline.covers) if redline.covers else []
    except (json.JSONDecodeError, TypeError):
        data["covers"] = []

    data["rule_title"] = redline.rule.title if redline.rule else None
    return data


def _sorted_redlines(review: ContractReview) -> list[dict]:
    ordered = sorted(
        review.redlines,
        key=lambda r: (SEVERITY_ORDER.get(r.classification, 9), r.sort_order),
    )
    return [_serialise_redline(r) for r in ordered]


@router.post("", response_model=ContractReviewOut, status_code=201)
async def create_review(
    background_tasks: BackgroundTasks,
    playbook_id: int = Form(...),
    name: str = Form(...),
    counterparty: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a contract and start a redline review against the chosen playbook."""
    playbook = db.query(Playbook).filter(Playbook.id == playbook_id).first()
    if not playbook:
        raise HTTPException(404, "Playbook not found")

    file_name, file_path, ext = _save_upload(file)
    review = ContractReview(
        playbook_id=playbook_id,
        name=name,
        counterparty=counterparty,
        file_name=file_name,
        file_path=file_path,
        doc_kind=ext,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    background_tasks.add_task(_run_review, review.id)
    return review


@router.get("", response_model=list[ContractReviewOut])
def list_reviews(db: Session = Depends(get_db)):
    return (
        db.query(ContractReview).order_by(ContractReview.created_at.desc()).all()
    )


@router.get("/{review_id}", response_model=ContractReviewDetail)
def get_review(review_id: int, db: Session = Depends(get_db)):
    review = db.query(ContractReview).filter(ContractReview.id == review_id).first()
    if not review:
        raise HTTPException(404, "Review not found")

    blocks = load_blocks(review.blocks_json)
    playbook = review.playbook
    return {
        **{c.name: getattr(review, c.name) for c in review.__table__.columns},
        "playbook": {
            "id": playbook.id,
            "name": playbook.name,
            "description": playbook.description,
            "our_party": playbook.our_party,
            "is_default": playbook.is_default,
            "created_at": playbook.created_at,
            "updated_at": playbook.updated_at,
            "rule_count": len(playbook.rules),
        },
        "redlines": _sorted_redlines(review),
        "blocks": blocks,
        "sections": sections_of(blocks),
        "export_is_faithful": review.doc_kind == "docx",
    }


@router.get("/{review_id}/file")
def get_contract_file(review_id: int, db: Session = Depends(get_db)):
    """Serve the original upload, for download and for the PDF fallback view."""
    review = db.query(ContractReview).filter(ContractReview.id == review_id).first()
    if not review:
        raise HTTPException(404, "Review not found")
    if not os.path.exists(review.file_path):
        raise HTTPException(404, "The uploaded file is missing on disk")
    ext = os.path.splitext(review.file_path)[1].lower()
    return FileResponse(
        review.file_path,
        media_type=MEDIA_TYPES.get(ext, "application/octet-stream"),
        headers={"Content-Disposition": f'inline; filename="{review.file_name}"'},
    )


# ----------------------------------------------------------- editing redlines
@router.patch("/{review_id}/redlines/{redline_id}", response_model=RedlineOut)
def update_redline(
    review_id: int,
    redline_id: int,
    payload: RedlineUpdate,
    db: Session = Depends(get_db),
):
    """Accept, reject, or rewrite one suggestion.

    Editing the text implies the suggestion was modified rather than accepted
    verbatim, and marks the row as human-owned so a re-run cannot overwrite it.
    """
    redline = (
        db.query(Redline)
        .filter(Redline.id == redline_id, Redline.review_id == review_id)
        .first()
    )
    if not redline:
        raise HTTPException(404, "Redline not found")

    fields = payload.model_dump(exclude_unset=True)

    if "status" in fields and fields["status"] not in (
        "suggested",
        "accepted",
        "rejected",
        "modified",
    ):
        raise HTTPException(400, f"Unknown status '{fields['status']}'")

    text_changed = False
    for field, value in fields.items():
        if field in ("proposed_text", "rationale") and value != getattr(redline, field):
            text_changed = True
        setattr(redline, field, value)

    if text_changed:
        redline.is_manual_override = True
        if "status" not in fields:
            redline.status = "modified"

    redline.edited_at = datetime.utcnow()
    db.commit()
    db.refresh(redline)
    return _serialise_redline(redline)


@router.post("/{review_id}/redlines", response_model=RedlineOut, status_code=201)
def create_redline(
    review_id: int, payload: RedlineCreate, db: Session = Depends(get_db)
):
    """Add a redline the model missed.

    Without this a reviewer cannot record their own point, and a tool a lawyer
    cannot add to is a tool they will not rely on.
    """
    review = db.query(ContractReview).filter(ContractReview.id == review_id).first()
    if not review:
        raise HTTPException(404, "Review not found")

    blocks = load_blocks(review.blocks_json)
    by_index = {b["index"]: b for b in blocks}

    data = payload.model_dump()
    start = data.get("block_start")
    if start is not None and start not in by_index:
        raise HTTPException(400, f"Block {start} does not exist in this document")

    # Anchoring to a block but not supplying the text is the common case when
    # the user selects a paragraph in the viewer.
    if start is not None and not data.get("original_text"):
        end = data.get("block_end") or start
        data["original_text"] = "\n".join(
            by_index[i]["text"] for i in range(start, end + 1) if i in by_index
        )
    if start is not None and not data.get("doc_section"):
        data["doc_section"] = by_index[start].get("section")

    next_order = max((r.sort_order for r in review.redlines), default=-1) + 1
    redline = Redline(
        review_id=review_id,
        sort_order=next_order,
        page=by_index[start].get("page") if start is not None else None,
        status="modified",
        source="user",
        is_manual_override=True,
        edited_at=datetime.utcnow(),
        **data,
    )
    db.add(redline)
    db.commit()
    db.refresh(redline)
    return _serialise_redline(redline)


@router.delete("/{review_id}/redlines/{redline_id}", status_code=204)
def delete_redline(review_id: int, redline_id: int, db: Session = Depends(get_db)):
    redline = (
        db.query(Redline)
        .filter(Redline.id == redline_id, Redline.review_id == review_id)
        .first()
    )
    if not redline:
        raise HTTPException(404, "Redline not found")
    db.delete(redline)
    db.commit()


# ---------------------------------------------------------------- exporting
def _safe_name(name: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in name)[:80]


@router.get("/{review_id}/export/redline")
def export_redline(review_id: int, db: Session = Depends(get_db)):
    """The marked-up contract, as a Word file with real tracked changes."""
    review = db.query(ContractReview).filter(ContractReview.id == review_id).first()
    if not review:
        raise HTTPException(404, "Review not found")
    if review.status != "completed":
        raise HTTPException(400, "The review is not complete yet")
    if not os.path.exists(review.file_path):
        raise HTTPException(404, "The uploaded file is missing on disk")

    data, faithful = export_redline_docx(review, review.redlines)
    suffix = "" if faithful else "_reconstructed"
    filename = f"Redline_{_safe_name(review.name)}{suffix}.docx"
    return Response(
        content=data,
        media_type=DOCX_MEDIA,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # Lets the UI warn that formatting was not preserved.
            "X-Export-Faithful": "true" if faithful else "false",
        },
    )


@router.get("/{review_id}/export/issues")
def export_issues(review_id: int, db: Session = Depends(get_db)):
    """The issues list, as a table - the dense tabular summary for circulation."""
    review = db.query(ContractReview).filter(ContractReview.id == review_id).first()
    if not review:
        raise HTTPException(404, "Review not found")
    if review.status != "completed":
        raise HTTPException(400, "The review is not complete yet")

    ordered = sorted(
        review.redlines,
        key=lambda r: (SEVERITY_ORDER.get(r.classification, 9), r.sort_order),
    )
    data = generate_issues_list_docx(review, ordered)
    filename = f"IssuesList_{_safe_name(review.name)}.docx"
    return Response(
        content=data,
        media_type=DOCX_MEDIA,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/{review_id}", status_code=204)
def delete_review(review_id: int, db: Session = Depends(get_db)):
    review = db.query(ContractReview).filter(ContractReview.id == review_id).first()
    if not review:
        raise HTTPException(404, "Review not found")
    if os.path.exists(review.file_path):
        os.remove(review.file_path)
    db.delete(review)
    db.commit()
