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
from ..models import (
    ContractReview,
    ContractVersion,
    Issue,
    Playbook,
    PlaybookRule,
    Redline,
    StatusEvent,
)
from ..schemas import (
    ContractReviewDetail,
    ContractReviewOut,
    IssueUpdate,
    RedlineCreate,
    RedlineOut,
    RedlineUpdate,
    StatusUpdate,
    VendorSend,
)
from ..services.diff_util import change_summary, diff_ops
from ..services.document_model import (
    attach_annotations,
    blocks_to_text,
    dump_blocks,
    extract_blocks,
    extract_docx_annotations,
    load_blocks,
    sections_of,
)
from ..services.reconcile import changed_blocks, classify_response, revision_authors
from ..services.redline_engine import (
    assess_clause,
    find_missing,
    group_hits,
    locate_clauses,
)
from ..services.redline_export import export_redline_docx, exportable_redlines
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

REDLINE_STATUSES = ("suggested", "accepted", "rejected", "modified")
ISSUE_STATUSES = ("open", "countered", "agreed", "conceded", "dropped")
# The two a human is allowed to set directly. Everything else follows from what
# the app can observe, and a status someone has to remember to set goes stale.
MANUAL_STATUSES = ("pending_vendor", "completed", "in_process")

# An issue in one of these has been put to bed. The counterparty reopening it in
# a later round is a regression worth surfacing, not a routine carry-forward.
SETTLED = ("agreed", "conceded", "dropped")

# The only redlines that reach the counterparty - the same rule the exporter
# applies. A finding left undecided, or one the reviewer rejected, was never in
# the file they received, so the next round must not report their silence on it
# as a refusal.
RAISED_STATUSES = ("accepted", "modified")


def _was_raised(previous: Redline, sent_ids: set[int] | None) -> bool:
    """Did the counterparty actually receive this point?

    Answered from the snapshot taken when the round was marked sent, and only
    from the redline's current status when there is no snapshot - otherwise a
    decision changed after sending would rewrite history.
    """
    if sent_ids is not None:
        return previous.id in sent_ids
    return previous.status in RAISED_STATUSES


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


# ------------------------------------------------------------------- status
def _set_status(
    db: Session,
    review: ContractReview,
    to_status: str,
    *,
    manual: bool = False,
    note: str | None = None,
    round_number: int | None = None,
) -> None:
    """Move the negotiation and record why. Idempotent."""
    if review.status == to_status:
        review.last_activity_at = datetime.utcnow()
        return
    db.add(
        StatusEvent(
            review_id=review.id,
            from_status=review.status,
            to_status=to_status,
            round_number=round_number or review.current_round,
            note=note,
            is_manual=manual,
        )
    )
    review.status = to_status
    review.status_changed_at = datetime.utcnow()
    review.last_activity_at = review.status_changed_at
    if to_status == "completed":
        review.completed_at = review.status_changed_at
    else:
        review.completed_at = None


def _mark_working(db: Session, review: ContractReview) -> None:
    """The first time anybody touches a finding, the deal is being worked.

    Automatic because it is observable. Asking a reviewer to flip a status they
    have already demonstrated by editing is the kind of bookkeeping that gets
    skipped, and then the list lies about where every deal stands.
    """
    if review.status == "ai_completed":
        _set_status(db, review, "in_process", note="A reviewer started working the redlines")
    else:
        review.last_activity_at = datetime.utcnow()


# ------------------------------------------------------------ round pipeline
def _fail(db: Session, version: ContractVersion, message: str) -> None:
    version.status = "failed"
    version.error_message = message
    _set_status(db, version.review, "failed", round_number=version.round_number)
    db.commit()


def _active_rules(db: Session, playbook_id: int) -> list[PlaybookRule]:
    return (
        db.query(PlaybookRule)
        .filter(
            PlaybookRule.playbook_id == playbook_id,
            PlaybookRule.is_active.is_(True),
        )
        .order_by(PlaybookRule.sort_order)
        .all()
    )


def _extract_version(db: Session, version: ContractVersion) -> list[dict] | None:
    """Build the block model for one round, and lift out the counterparty's own
    tracked changes and comments while the file is open."""
    version.status = "extracting"
    db.commit()

    blocks, doc_kind = extract_blocks(version.file_path)
    if not blocks:
        _fail(
            db,
            version,
            "No readable text found. If this is a scanned PDF it needs OCR "
            "before it can be reviewed.",
        )
        return None

    annotations = {}
    if doc_kind == "docx":
        annotations = extract_docx_annotations(version.file_path)
        blocks = attach_annotations(blocks, annotations)

    version.blocks_json = dump_blocks(blocks)
    version.doc_kind = doc_kind
    version.extracted_text = blocks_to_text(blocks)
    version.annotations_json = json.dumps(annotations, ensure_ascii=False)
    version.has_tracked_changes = bool(annotations.get("has_tracked_changes"))
    db.commit()
    return blocks


def _primary_rule(matched: list[PlaybookRule], failed: list[str]) -> PlaybookRule:
    """The most severe position the clause fails - it names the finding and
    links it back into the playbook."""
    return min(
        (r for r in matched if r.clause_type in failed),
        key=lambda r: SEVERITY_ORDER.get(r.severity, 9),
        default=matched[0],
    )


def _run_first_round(version_id: int) -> None:
    """Background task for the opening paper: locate, judge, draft.

    Sync on purpose: Starlette runs sync background tasks in a worker thread, so
    the blocking Azure calls do not stall the event loop and freeze every other
    request.
    """
    db: Session = SessionLocal()
    try:
        version = db.get(ContractVersion, version_id)
        if not version:
            return
        review = version.review

        rules = _active_rules(db, review.playbook_id)
        if not rules:
            _fail(
                db,
                version,
                "The selected playbook has no active rules. Add rules in the "
                "Playbook Manager before running a review.",
            )
            return

        blocks = _extract_version(db, version)
        if blocks is None:
            return

        version.status = "analyzing"
        db.commit()

        rules_by_type = {r.clause_type: r for r in rules}
        hits = locate_clauses(blocks, list(rules_by_type.keys()))
        # One clause, one edit — even where several positions bear on it. Two
        # edits to the same paragraph cannot both survive into the exported
        # document, and the clause gets negotiated as a single conversation.
        groups = group_hits(hits)
        version.total_clauses = len(groups)
        db.commit()

        order = 0
        for group in groups:
            matched = [
                rules_by_type[t] for t in group["clause_types"] if t in rules_by_type
            ]
            if not matched:
                continue
            result = assess_clause(group["text"], matched)
            failed = result["failed_positions"] or group["clause_types"]
            primary = _primary_rule(matched, failed)

            issue = Issue(
                review_id=review.id,
                clause_type=primary.clause_type,
                title=group.get("clause_title") or primary.title,
                clause_ref=group.get("clause_ref"),
                doc_section=group.get("section"),
                rule_id=primary.id,
                status="agreed" if result["classification"] == "ACCEPTABLE" else "open",
                first_round=version.round_number,
                resolved_round=(
                    version.round_number
                    if result["classification"] == "ACCEPTABLE"
                    else None
                ),
            )
            db.add(issue)
            db.flush()

            db.add(
                Redline(
                    review_id=review.id,
                    version_id=version.id,
                    issue_id=issue.id,
                    sort_order=order,
                    doc_section=group.get("section"),
                    clause_ref=group.get("clause_ref"),
                    clause_title=issue.title,
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
            version.analyzed_count = order
            db.commit()

        # Required protections with no clause anywhere in the contract. The
        # opening round looked at every paragraph, so its set difference is
        # sound — unlike a later round, which only re-reads what changed.
        found_types = {h["clause_type"] for h in hits}
        version.found_types = json.dumps(sorted(found_types))
        order = _raise_missing(db, review, version, rules, found_types, order)

        _finish_round(db, review, version, order)

    except Exception as exc:
        _crash(db, version_id, exc)
    finally:
        db.close()


def _raise_missing(
    db: Session,
    review: ContractReview,
    version: ContractVersion,
    rules: list[PlaybookRule],
    found_types: set[str],
    order: int,
) -> int:
    """Open an issue for every required protection the contract does not contain.

    Skips anything already threaded: from round two these carry forward as
    unresolved issues rather than being raised a second time.
    """
    existing = {
        i.clause_type
        for i in db.query(Issue).filter(Issue.review_id == review.id).all()
        if i.clause_type
    }
    for gap in find_missing(found_types, rules):
        if gap["clause_type"] in existing:
            continue
        issue = Issue(
            review_id=review.id,
            clause_type=gap["clause_type"],
            title=gap["rule"].title,
            rule_id=gap["rule"].id,
            status="open",
            first_round=version.round_number,
        )
        db.add(issue)
        db.flush()
        db.add(
            Redline(
                review_id=review.id,
                version_id=version.id,
                issue_id=issue.id,
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
    return order


def _finish_round(
    db: Session, review: ContractReview, version: ContractVersion, order: int
) -> None:
    version.total_clauses = order
    version.analyzed_count = order
    version.status = "completed"
    version.completed_at = datetime.utcnow()
    _set_status(db, review, "ai_completed", round_number=version.round_number)
    db.commit()


def _crash(db: Session, version_id: int, exc: Exception) -> None:
    try:
        db.rollback()
        version = db.get(ContractVersion, version_id)
        if version:
            version.status = "failed"
            version.error_message = str(exc)
            _set_status(db, version.review, "failed", round_number=version.round_number)
            db.commit()
    except Exception:
        pass


def _run_next_round(version_id: int) -> None:
    """Background task for a version the counterparty sent back.

    Three passes, in this order and for a reason:

      1. reconcile  - what did they do with each position we put to them
      2. new risk   - full playbook analysis, but only on language they added
      3. gaps       - required protections still absent

    Only step 2 costs model calls at any scale, and it runs over the handful of
    paragraphs that actually changed. That is what stops a fifth round costing
    the same as the first, and it is also what makes the round readable: a
    reviewer sees what moved, not forty findings they already worked through.
    """
    db: Session = SessionLocal()
    try:
        version = db.get(ContractVersion, version_id)
        if not version:
            return
        review = version.review

        rules = _active_rules(db, review.playbook_id)
        if not rules:
            _fail(db, version, "The selected playbook has no active rules.")
            return

        prior = (
            db.query(ContractVersion)
            .filter(
                ContractVersion.review_id == review.id,
                ContractVersion.round_number < version.round_number,
            )
            .order_by(ContractVersion.round_number.desc())
            .first()
        )
        if not prior:
            _run_first_round_inline(db, version, rules)
            return

        blocks = _extract_version(db, version)
        if blocks is None:
            return

        version.status = "analyzing"
        db.commit()

        rules_by_type = {r.clause_type: r for r in rules}
        prior_blocks = load_blocks(prior.blocks_json)
        prior_redlines = (
            db.query(Redline)
            .filter(Redline.version_id == prior.id)
            .order_by(Redline.sort_order)
            .all()
        )
        comment_lookup = _comment_lookup(blocks)
        sent_ids = None
        if prior.sent_redline_ids:
            try:
                sent_ids = set(json.loads(prior.sent_redline_ids))
            except (json.JSONDecodeError, TypeError):
                sent_ids = None

        version.total_clauses = len(prior_redlines)
        db.commit()

        order = 0
        claimed: list[tuple[int, int]] = []

        for previous in prior_redlines:
            outcome = classify_response(previous, blocks)
            carried = _carry_forward(
                db, review, version, previous, outcome, rules_by_type,
                comment_lookup, order, sent_ids,
            )
            if carried is None:
                continue
            order += 1
            if carried.block_start is not None:
                claimed.append(
                    (carried.block_start, carried.block_end or carried.block_start)
                )
            version.analyzed_count = order
            db.commit()

        # What the contract was already known to contain. A round only
        # re-analyses paragraphs that changed, so it never re-detects the
        # clauses it had no reason to look at again — and computing absence
        # from this round's hits alone declared every untouched protection
        # missing, inventing a dozen findings out of a document nobody edited.
        baseline = None
        if prior.found_types:
            try:
                baseline = set(json.loads(prior.found_types))
            except (json.JSONDecodeError, TypeError):
                baseline = None
        found_types = set() if baseline is None else set(baseline)
        found_types.update(
            r.clause_type
            for r in db.query(Redline).filter(Redline.version_id == version.id).all()
            if r.clause_type and r.classification != "MISSING"
        )

        # Their edits are where fresh risk enters: a new limitation of liability,
        # a widened IP grant, an auto-renewal nobody asked for. Only new language
        # gets the full treatment.
        order = _analyse_new_language(
            db, review, version, blocks, prior_blocks, rules_by_type, claimed,
            order, found_types,
        )

        version.found_types = json.dumps(sorted(found_types))
        # A round recorded before this set was kept cannot say what the contract
        # contains, and guessing from the handful of clauses this round happened
        # to re-analyse would report every untouched protection as absent. A gap
        # that was real was already raised as an issue in the round that found
        # it, and carries forward on its own.
        if baseline is not None:
            order = _raise_missing(db, review, version, rules, found_types, order)

        _finish_round(db, review, version, order)

    except Exception as exc:
        _crash(db, version_id, exc)
    finally:
        db.close()


def _run_first_round_inline(
    db: Session, version: ContractVersion, rules: list[PlaybookRule]
) -> None:
    """A later round with nothing to compare against - treat it as an opening."""
    db.close()
    _run_first_round(version.id)


def _comment_lookup(blocks: list[dict]) -> dict[int, str]:
    """block index -> the counterparty's margin comment on it, if any."""
    lookup: dict[int, str] = {}
    for block in blocks:
        comments = block.get("comments") or []
        if comments:
            lookup[block["index"]] = " ".join(
                f"{c['author']}: {c['text']}" for c in comments
            )
    return lookup


def _comment_for(lookup: dict[int, str], start, end) -> str | None:
    if start is None:
        return None
    parts = [lookup[i] for i in range(start, (end or start) + 1) if i in lookup]
    return " ".join(parts) if parts else None


def _carry_forward(
    db: Session,
    review: ContractReview,
    version: ContractVersion,
    previous: Redline,
    outcome: dict,
    rules_by_type: dict,
    comment_lookup: dict[int, str],
    order: int,
    sent_ids: set[int] | None = None,
) -> Redline | None:
    """Thread one position from the last round into this one.

    The redline that comes out records both halves of the exchange: what they
    did to our ask, and what we now propose in light of it.
    """
    issue = db.get(Issue, previous.issue_id) if previous.issue_id else None
    action = outcome["action"]
    was_settled = issue.status in SETTLED if issue else False
    was_raised = _was_raised(previous, sent_ids)

    # Asking for a clause they never added and asking for wording they reverted
    # are the same decision from where a reviewer sits: we asked, they declined.
    if action == "ignored":
        action = "rejected"

    # They cannot have declined something they never received — and a point
    # already settled is not re-litigated by them leaving it alone. A clause the
    # opening round judged acceptable has no edit to send and an issue that is
    # agreed on arrival; reporting their silence on it as a refusal put "Vendor
    # rejected" next to "Agreed" on the same row, which is a contradiction.
    if action == "rejected" and (not was_raised or was_settled):
        action = "not_sent"
    elif action == "countered" and not was_raised:
        action = "new_change"

    # A point that was already put to bed and has moved again is the one thing
    # in a late round nobody can afford to skim past.
    if was_settled and action in ("countered", "new_change", "removed"):
        action = "reopened"

    block_start = outcome.get("block_start")
    block_end = outcome.get("block_end")
    current_text = outcome.get("text") or ""
    vendor_comment = _comment_for(comment_lookup, block_start, block_end)

    classification = previous.classification
    proposed = previous.proposed_text
    rationale = previous.rationale
    status = "suggested"
    issue_status = "open"

    if action == "accepted":
        classification = "ACCEPTABLE"
        proposed = None
        status = "accepted"
        issue_status = "agreed"
        rationale = (
            f"Accepted in round {version.round_number}: the counterparty took our "
            "proposed wording."
        )

    elif action == "not_sent":
        # Carried forward exactly as it stood. The counterparty had nothing to
        # do with it, so neither our decision nor the point's standing moves —
        # resetting either would quietly undo a call somebody already made.
        status = previous.status
        issue_status = issue.status if issue else "open"

    elif action == "rejected":
        if was_settled:
            # We had already stopped pushing this. Them leaving it alone is not
            # news, and re-opening it would put a dead point back in front of a
            # reviewer every round.
            status = "rejected"
            issue_status = issue.status
        else:
            note = (
                "The counterparty did not add this clause."
                if not previous.original_text
                else "The counterparty left this clause as originally drafted."
            )
            rationale = f"{note} {previous.rationale or ''}".strip()

    elif action == "removed":
        if previous.classification == "MISSING":
            issue_status = issue.status if was_settled else "open"
            status = "rejected" if was_settled else "suggested"
            rationale = (
                f"The counterparty did not add this clause. {previous.rationale or ''}"
            ).strip()
        else:
            # Deleting a clause we objected to can be a win or a new hole. The
            # tool does not guess; it flags the deletion and lets a lawyer read it.
            rationale = (
                f"The counterparty deleted this clause in round {version.round_number}. "
                f"Confirm the deletion resolves the point rather than removing a "
                f"protection. {previous.rationale or ''}"
            ).strip()
            issue_status = "open"

    else:  # countered, changed unasked, or reopened
        matched = [
            rules_by_type[t]
            for t in (_covers(previous) or [previous.clause_type])
            if t in rules_by_type
        ]
        if matched and current_text.strip():
            result = assess_clause(current_text, matched)
            classification = result["classification"]
            if classification == "ACCEPTABLE":
                proposed = None
                status = "accepted"
                issue_status = "agreed"
                rationale = (
                    f"The counterparty's revised wording in round "
                    f"{version.round_number} meets our position."
                )
            else:
                proposed = result["proposed_text"] or previous.proposed_text
                rationale = result["rationale"] or previous.rationale
                issue_status = "countered"
        else:
            issue_status = "countered"

        if action in ("new_change", "reopened") and issue_status != "agreed":
            # They rewrote a clause we had flagged but never put to them.
            # Unprompted edits are where fresh risk enters, and the note has to
            # survive even when no playbook rule matched to re-judge it —
            # that is exactly the case nobody will otherwise look at twice.
            opener = (
                "This point was settled, and the counterparty has changed the "
                "clause again"
                if action == "reopened"
                else "The counterparty rewrote this clause without being asked"
            )
            rationale = f"{opener} in round {version.round_number}. {rationale or ''}".strip()

        if was_settled and issue_status != "agreed":
            rationale = (
                f"Reopened: this point was settled, but the counterparty changed "
                f"the clause again in round {version.round_number}. {rationale or ''}"
            ).strip()

    redline = Redline(
        review_id=review.id,
        version_id=version.id,
        issue_id=previous.issue_id,
        prior_redline_id=previous.id,
        sort_order=order,
        doc_section=outcome.get("section") or previous.doc_section,
        clause_ref=previous.clause_ref,
        clause_title=previous.clause_title,
        block_start=block_start,
        block_end=block_end,
        page=outcome.get("page"),
        clause_type=previous.clause_type,
        covers=previous.covers,
        rule_id=previous.rule_id,
        original_text=current_text if previous.original_text else "",
        proposed_text=proposed,
        classification=classification,
        rationale=rationale,
        vendor_action=action,
        vendor_comment=vendor_comment,
        is_vendor_introduced=previous.is_vendor_introduced,
        status=status,
        source=previous.source,
    )
    db.add(redline)

    if issue:
        issue.status = issue_status
        issue.resolved_round = (
            version.round_number if issue_status in SETTLED else None
        )
        if block_start is not None:
            issue.doc_section = outcome.get("section") or issue.doc_section

    return redline


def _covers(redline: Redline) -> list[str]:
    try:
        return json.loads(redline.covers) if redline.covers else []
    except (json.JSONDecodeError, TypeError):
        return []


def _analyse_new_language(
    db: Session,
    review: ContractReview,
    version: ContractVersion,
    blocks: list[dict],
    prior_blocks: list[dict],
    rules_by_type: dict,
    claimed: list[tuple[int, int]],
    order: int,
    found_types: set[str],
) -> int:
    """Run the playbook over paragraphs the counterparty added or rewrote."""
    fresh = changed_blocks(blocks, prior_blocks)
    if not fresh:
        return order

    # Positions already being negotiated. A re-detection of one of these is the
    # same argument in slightly different words, and raising it twice would put
    # a reviewer in the position of conceding a point they had already won.
    live_types = {
        i.clause_type
        for i in db.query(Issue).filter(Issue.review_id == review.id).all()
        if i.clause_type and i.status not in SETTLED
    }

    hits = locate_clauses(fresh, list(rules_by_type.keys()))
    found_types.update(h["clause_type"] for h in hits)

    for group in group_hits(hits):
        # A clause already threaded from last round is not new risk, however
        # much of it they retyped.
        if any(
            group["block_start"] <= end and group["block_end"] >= start
            for start, end in claimed
        ):
            continue
        if any(t in live_types for t in group["clause_types"]):
            continue

        matched = [
            rules_by_type[t] for t in group["clause_types"] if t in rules_by_type
        ]
        if not matched:
            continue
        result = assess_clause(group["text"], matched)
        if result["classification"] == "ACCEPTABLE":
            continue

        failed = result["failed_positions"] or group["clause_types"]
        primary = _primary_rule(matched, failed)

        issue = Issue(
            review_id=review.id,
            clause_type=primary.clause_type,
            title=group.get("clause_title") or primary.title,
            clause_ref=group.get("clause_ref"),
            doc_section=group.get("section"),
            rule_id=primary.id,
            status="open",
            first_round=version.round_number,
            is_vendor_introduced=True,
        )
        db.add(issue)
        db.flush()

        db.add(
            Redline(
                review_id=review.id,
                version_id=version.id,
                issue_id=issue.id,
                sort_order=order,
                doc_section=group.get("section"),
                clause_ref=group.get("clause_ref"),
                clause_title=issue.title,
                block_start=group["block_start"],
                block_end=group["block_end"],
                page=group.get("page"),
                clause_type=primary.clause_type,
                covers=json.dumps(failed),
                rule_id=primary.id,
                original_text=group["text"],
                proposed_text=result["proposed_text"],
                classification=result["classification"],
                rationale=(
                    f"New in round {version.round_number} — added by the "
                    f"counterparty. {result['rationale'] or ''}"
                ).strip(),
                is_vendor_introduced=True,
                vendor_action="new_change",
                status="suggested",
                source="ai",
            )
        )
        order += 1
        version.analyzed_count = order
        db.commit()

    return order


# ---------------------------------------------------------------- serialising
def _serialise_redline(redline: Redline, history: list[dict] | None = None) -> dict:
    """Attach the derived diff. Computed per request so a user's edit shows up
    immediately and matches what the exporter will write."""
    data = {c.name: getattr(redline, c.name) for c in redline.__table__.columns}
    original = redline.original_text or ""
    proposed = redline.proposed_text or ""

    if redline.status == "rejected" or not proposed:
        data["diff"] = []
        data["words_added"] = 0
        data["words_removed"] = 0
    else:
        data["diff"] = diff_ops(original, proposed)
        data.update(change_summary(original, proposed))

    data["covers"] = _covers(redline)
    data["rule_title"] = redline.rule.title if redline.rule else None
    issue = redline.issue
    data["issue_status"] = issue.status if issue else None
    data["issue_first_round"] = issue.first_round if issue else None
    data["round_number"] = redline.version.round_number if redline.version else 1
    data["history"] = history or []
    return data


def _build_history(review: ContractReview) -> dict[int, list[dict]]:
    """issue id -> what was asked and what came back, round by round.

    The thread is the point of the whole feature: a reviewer in round three has
    to see that they already conceded the cap in exchange for the carve-outs,
    or they will trade it away twice.
    """
    rounds = {v.id: v.round_number for v in review.versions}
    threads: dict[int, list[dict]] = {}
    for redline in sorted(review.redlines, key=lambda r: (r.id,)):
        if redline.issue_id is None:
            continue
        threads.setdefault(redline.issue_id, []).append(
            {
                "round": rounds.get(redline.version_id, 1),
                "redline_id": redline.id,
                "our_proposal": redline.proposed_text,
                "their_text": redline.original_text or None,
                "vendor_action": redline.vendor_action,
                "vendor_comment": redline.vendor_comment,
                "classification": redline.classification,
                "status": redline.status,
            }
        )
    for entries in threads.values():
        entries.sort(key=lambda e: e["round"])
    return threads


def _serialise_version(version: ContractVersion) -> dict:
    authors: list[str] = []
    if version.annotations_json:
        try:
            authors = revision_authors(json.loads(version.annotations_json))
        except (json.JSONDecodeError, TypeError):
            authors = []
    return {
        "id": version.id,
        "round_number": version.round_number,
        "direction": version.direction,
        "file_name": version.file_name,
        "doc_kind": version.doc_kind,
        "status": version.status,
        "error_message": version.error_message,
        "total_clauses": version.total_clauses,
        "analyzed_count": version.analyzed_count,
        "has_tracked_changes": version.has_tracked_changes,
        "revision_authors": authors,
        "sent_at": version.sent_at,
        "sent_note": version.sent_note,
        "created_at": version.created_at,
        "completed_at": version.completed_at,
    }


def _serialise_issue(issue: Issue) -> dict:
    return {
        "id": issue.id,
        "clause_type": issue.clause_type,
        "title": issue.title,
        "clause_ref": issue.clause_ref,
        "doc_section": issue.doc_section,
        "status": issue.status,
        "first_round": issue.first_round,
        "resolved_round": issue.resolved_round,
        "is_vendor_introduced": issue.is_vendor_introduced,
    }


def _latest_version(review: ContractReview) -> ContractVersion | None:
    if not review.versions:
        return None
    return max(review.versions, key=lambda v: v.round_number)


def _round_summary(version: ContractVersion) -> dict:
    """Just enough about a round for the list page to expand it inline."""
    return {
        "id": version.id,
        "round_number": version.round_number,
        "direction": version.direction,
        "file_name": version.file_name,
        "doc_kind": version.doc_kind,
        "status": version.status,
        "has_tracked_changes": version.has_tracked_changes,
        "total_clauses": version.total_clauses,
        "sent_at": version.sent_at,
        "created_at": version.created_at,
    }


def _review_summary(review: ContractReview) -> dict:
    latest = _latest_version(review)
    open_issues = sum(1 for i in review.issues if i.status in ("open", "countered"))
    return {
        "id": review.id,
        "playbook_id": review.playbook_id,
        "name": review.name,
        "counterparty": review.counterparty,
        "status": review.status,
        "current_round": review.current_round,
        "total_rounds": len(review.versions),
        # Carried on the list row so a negotiation can be expanded into its
        # rounds without a second request per row.
        "rounds": [
            _round_summary(v)
            for v in sorted(review.versions, key=lambda v: v.round_number)
        ],
        "open_issues": open_issues,
        "total_issues": len(review.issues),
        "file_name": latest.file_name if latest else "",
        "doc_kind": latest.doc_kind if latest else "docx",
        "round_status": latest.status if latest else "queued",
        "error_message": latest.error_message if latest else None,
        "total_clauses": latest.total_clauses if latest else 0,
        "analyzed_count": latest.analyzed_count if latest else 0,
        "sent_to_vendor_at": review.sent_to_vendor_at,
        "status_changed_at": review.status_changed_at,
        "last_activity_at": review.last_activity_at,
        "created_at": review.created_at,
        "completed_at": review.completed_at,
    }


# -------------------------------------------------------------- negotiations
@router.post("", response_model=ContractReviewOut, status_code=201)
async def create_review(
    background_tasks: BackgroundTasks,
    playbook_id: int = Form(...),
    name: str = Form(...),
    counterparty: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a contract and start round one against the chosen playbook."""
    playbook = db.query(Playbook).filter(Playbook.id == playbook_id).first()
    if not playbook:
        raise HTTPException(404, "Playbook not found")

    file_name, file_path, ext = _save_upload(file)
    review = ContractReview(
        playbook_id=playbook_id,
        name=name,
        counterparty=counterparty,
        status="ai_in_progress",
        status_changed_at=datetime.utcnow(),
        last_activity_at=datetime.utcnow(),
        current_round=1,
    )
    db.add(review)
    db.flush()

    version = ContractVersion(
        review_id=review.id,
        round_number=1,
        direction="inbound",
        file_name=file_name,
        file_path=file_path,
        doc_kind=ext,
        status="queued",
    )
    db.add(version)
    db.add(
        StatusEvent(
            review_id=review.id,
            from_status=None,
            to_status="ai_in_progress",
            round_number=1,
            note="Contract uploaded",
        )
    )
    db.commit()
    db.refresh(version)

    background_tasks.add_task(_run_first_round, version.id)
    return _review_summary(review)


@router.post("/{review_id}/rounds", response_model=ContractReviewOut, status_code=201)
async def add_round(
    review_id: int,
    background_tasks: BackgroundTasks,
    note: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload the version the counterparty sent back and start the next round.

    Reconciliation needs the previous round to have produced something to
    reconcile against, so a round that failed or is still running blocks this.
    """
    review = db.query(ContractReview).filter(ContractReview.id == review_id).first()
    if not review:
        raise HTTPException(404, "Review not found")

    latest = _latest_version(review)
    if latest is None:
        raise HTTPException(400, "This review has no first round to compare against")
    if latest.status not in ("completed", "failed"):
        raise HTTPException(
            400,
            "The current round is still being processed. Wait for it to finish "
            "before uploading the counterparty's response.",
        )
    if latest.status == "failed":
        raise HTTPException(
            400,
            "The current round failed to process, so there is nothing to compare "
            "the response against.",
        )

    file_name, file_path, ext = _save_upload(file)
    version = ContractVersion(
        review_id=review.id,
        round_number=latest.round_number + 1,
        direction="inbound",
        file_name=file_name,
        file_path=file_path,
        doc_kind=ext,
        status="queued",
        sent_note=note,
    )
    db.add(version)
    review.current_round = version.round_number
    review.sent_to_vendor_at = None
    _set_status(
        db,
        review,
        "ai_in_progress",
        note=note or f"Round {version.round_number} received from the counterparty",
        round_number=version.round_number,
    )
    db.commit()
    db.refresh(version)

    background_tasks.add_task(_run_next_round, version.id)
    return _review_summary(review)


@router.get("", response_model=list[ContractReviewOut])
def list_reviews(db: Session = Depends(get_db)):
    reviews = (
        db.query(ContractReview).order_by(ContractReview.created_at.desc()).all()
    )
    return [_review_summary(r) for r in reviews]


@router.get("/{review_id}", response_model=ContractReviewDetail)
def get_review(
    review_id: int, version_id: int | None = None, db: Session = Depends(get_db)
):
    """One negotiation, viewed through one of its rounds.

    Defaults to the latest round, which is what a reviewer wants every time
    except when they are looking back at what was asked earlier.
    """
    review = db.query(ContractReview).filter(ContractReview.id == review_id).first()
    if not review:
        raise HTTPException(404, "Review not found")

    versions = sorted(review.versions, key=lambda v: v.round_number)
    selected = None
    if version_id is not None:
        selected = next((v for v in versions if v.id == version_id), None)
        if selected is None:
            raise HTTPException(404, "That round does not belong to this review")
    else:
        selected = versions[-1] if versions else None

    blocks = load_blocks(selected.blocks_json) if selected else []
    threads = _build_history(review)
    redlines = sorted(
        [r for r in review.redlines if selected and r.version_id == selected.id],
        key=lambda r: (SEVERITY_ORDER.get(r.classification, 9), r.sort_order),
    )

    playbook = review.playbook
    return {
        **_review_summary(review),
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
        "versions": [_serialise_version(v) for v in versions],
        "version": _serialise_version(selected) if selected else None,
        "issues": [_serialise_issue(i) for i in review.issues],
        "redlines": [
            _serialise_redline(r, threads.get(r.issue_id, [])) for r in redlines
        ],
        "blocks": blocks,
        "sections": sections_of(blocks),
        "export_is_faithful": bool(selected and selected.doc_kind == "docx"),
        "status_events": [
            {
                "from_status": e.from_status,
                "to_status": e.to_status,
                "round_number": e.round_number,
                "note": e.note,
                "is_manual": e.is_manual,
                "created_at": e.created_at,
            }
            for e in review.status_events
        ],
    }


@router.get("/{review_id}/file")
def get_contract_file(
    review_id: int, version_id: int | None = None, db: Session = Depends(get_db)
):
    """Serve one round's upload, for download and for the PDF fallback view."""
    review = db.query(ContractReview).filter(ContractReview.id == review_id).first()
    if not review:
        raise HTTPException(404, "Review not found")

    version = (
        next((v for v in review.versions if v.id == version_id), None)
        if version_id is not None
        else _latest_version(review)
    )
    if not version:
        raise HTTPException(404, "No document has been uploaded for this review")
    if not os.path.exists(version.file_path):
        raise HTTPException(404, "The uploaded file is missing on disk")

    ext = os.path.splitext(version.file_path)[1].lower()
    return FileResponse(
        version.file_path,
        media_type=MEDIA_TYPES.get(ext, "application/octet-stream"),
        headers={"Content-Disposition": f'inline; filename="{version.file_name}"'},
    )


# ------------------------------------------------------------- deal statuses
@router.post("/{review_id}/sent", response_model=ContractReviewOut)
def mark_sent_to_vendor(
    review_id: int, payload: VendorSend, db: Session = Depends(get_db)
):
    """Record that this round's redline went to the counterparty.

    The one transition the app genuinely cannot observe — nothing here can see
    an email leave an inbox — which is why it is a button rather than something
    inferred. The timestamp it captures is what drives the ageing on the list.
    """
    review = db.query(ContractReview).filter(ContractReview.id == review_id).first()
    if not review:
        raise HTTPException(404, "Review not found")

    latest = _latest_version(review)
    if not latest or latest.status != "completed":
        raise HTTPException(400, "Finish reviewing this round before sending it out")

    sent_at = payload.sent_at or datetime.utcnow()
    review.sent_to_vendor_at = sent_at
    latest.sent_at = sent_at
    latest.sent_note = payload.note or latest.sent_note
    # Freeze what the counterparty is actually receiving. Reading it back off
    # current statuses later would misreport any decision changed afterwards.
    latest.sent_redline_ids = json.dumps(
        [r.id for r in latest.redlines if r.status in RAISED_STATUSES and r.proposed_text]
    )
    _set_status(
        db,
        review,
        "pending_vendor",
        manual=True,
        note=payload.note or f"Round {latest.round_number} sent to the counterparty",
        round_number=latest.round_number,
    )
    db.commit()
    return _review_summary(review)


@router.post("/{review_id}/complete", response_model=ContractReviewOut)
def mark_complete(review_id: int, payload: StatusUpdate, db: Session = Depends(get_db)):
    """Close the negotiation. Allowed with issues still open — deals close with
    concessions, and a tool that refuses to record that is a tool people work
    around. The open count stays visible on the closed record."""
    review = db.query(ContractReview).filter(ContractReview.id == review_id).first()
    if not review:
        raise HTTPException(404, "Review not found")

    _set_status(
        db, review, "completed", manual=True, note=payload.note or "Negotiation closed"
    )
    db.commit()
    return _review_summary(review)


@router.patch("/{review_id}/status", response_model=ContractReviewOut)
def set_status(review_id: int, payload: StatusUpdate, db: Session = Depends(get_db)):
    """Manual override, for the cases the automatic transitions get wrong."""
    review = db.query(ContractReview).filter(ContractReview.id == review_id).first()
    if not review:
        raise HTTPException(404, "Review not found")
    if payload.status not in MANUAL_STATUSES:
        raise HTTPException(
            400,
            f"'{payload.status}' is set automatically from the round's progress. "
            f"Only {', '.join(MANUAL_STATUSES)} can be set by hand.",
        )
    if payload.status != "pending_vendor":
        review.sent_to_vendor_at = None
    _set_status(db, review, payload.status, manual=True, note=payload.note)
    db.commit()
    return _review_summary(review)


# ------------------------------------------------------------------- issues
@router.patch("/{review_id}/issues/{issue_id}")
def update_issue(
    review_id: int, issue_id: int, payload: IssueUpdate, db: Session = Depends(get_db)
):
    """Move one negotiating point in the ledger — conceded, agreed, dropped."""
    issue = (
        db.query(Issue)
        .filter(Issue.id == issue_id, Issue.review_id == review_id)
        .first()
    )
    if not issue:
        raise HTTPException(404, "Issue not found")
    if payload.status not in ISSUE_STATUSES:
        raise HTTPException(400, f"Unknown issue status '{payload.status}'")

    issue.status = payload.status
    issue.resolved_round = (
        issue.review.current_round if payload.status in SETTLED else None
    )
    _mark_working(db, issue.review)
    db.commit()
    return _serialise_issue(issue)


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
    `issue_status` rides along so that "accept their counter" moves the redline
    and settles the point in one call rather than two, which would otherwise
    leave the ledger inconsistent if the second failed.
    """
    redline = (
        db.query(Redline)
        .filter(Redline.id == redline_id, Redline.review_id == review_id)
        .first()
    )
    if not redline:
        raise HTTPException(404, "Redline not found")

    fields = payload.model_dump(exclude_unset=True)
    issue_status = fields.pop("issue_status", None)

    if "status" in fields and fields["status"] not in REDLINE_STATUSES:
        raise HTTPException(400, f"Unknown status '{fields['status']}'")
    if issue_status is not None and issue_status not in ISSUE_STATUSES:
        raise HTTPException(400, f"Unknown issue status '{issue_status}'")

    text_changed = False
    for field, value in fields.items():
        if field in ("proposed_text", "rationale") and value != getattr(redline, field):
            text_changed = True
        setattr(redline, field, value)

    if text_changed:
        redline.is_manual_override = True
        if "status" not in fields:
            redline.status = "modified"

    if issue_status and redline.issue:
        redline.issue.status = issue_status
        redline.issue.resolved_round = (
            redline.review.current_round if issue_status in SETTLED else None
        )

    redline.edited_at = datetime.utcnow()
    _mark_working(db, redline.review)
    db.commit()
    db.refresh(redline)
    threads = _build_history(redline.review)
    return _serialise_redline(redline, threads.get(redline.issue_id, []))


@router.post("/{review_id}/redlines", response_model=RedlineOut, status_code=201)
def create_redline(
    review_id: int, payload: RedlineCreate, db: Session = Depends(get_db)
):
    """Add a redline the model missed.

    Without this a reviewer cannot record their own point, and a tool a lawyer
    cannot add to is a tool they will not rely on. The point gets its own issue
    so it threads into later rounds like any other.
    """
    review = db.query(ContractReview).filter(ContractReview.id == review_id).first()
    if not review:
        raise HTTPException(404, "Review not found")

    version = _latest_version(review)
    if not version:
        raise HTTPException(400, "This review has no document to anchor a redline to")

    blocks = load_blocks(version.blocks_json)
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

    issue = Issue(
        review_id=review.id,
        clause_type=data.get("clause_type"),
        title=data["clause_title"],
        doc_section=data.get("doc_section"),
        status="open",
        first_round=version.round_number,
    )
    db.add(issue)
    db.flush()

    next_order = max((r.sort_order for r in version.redlines), default=-1) + 1
    redline = Redline(
        review_id=review_id,
        version_id=version.id,
        issue_id=issue.id,
        sort_order=next_order,
        page=by_index[start].get("page") if start is not None else None,
        status="modified",
        source="user",
        is_manual_override=True,
        edited_at=datetime.utcnow(),
        **data,
    )
    db.add(redline)
    _mark_working(db, review)
    db.commit()
    db.refresh(redline)
    return _serialise_redline(redline, [])


@router.delete("/{review_id}/redlines/{redline_id}", status_code=204)
def delete_redline(review_id: int, redline_id: int, db: Session = Depends(get_db)):
    redline = (
        db.query(Redline)
        .filter(Redline.id == redline_id, Redline.review_id == review_id)
        .first()
    )
    if not redline:
        raise HTTPException(404, "Redline not found")
    review = redline.review
    issue = redline.issue
    db.delete(redline)
    # An issue nobody ever raised in another round has no thread to preserve.
    if issue and len(issue.redlines) <= 1:
        db.delete(issue)
    _mark_working(db, review)
    db.commit()


# ---------------------------------------------------------------- exporting
def _safe_name(name: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in name)[:80]


def _export_target(
    review_id: int, version_id: int | None, db: Session
) -> tuple[ContractReview, ContractVersion, list[Redline]]:
    review = db.query(ContractReview).filter(ContractReview.id == review_id).first()
    if not review:
        raise HTTPException(404, "Review not found")

    version = (
        next((v for v in review.versions if v.id == version_id), None)
        if version_id is not None
        else _latest_version(review)
    )
    if not version:
        raise HTTPException(404, "No document has been uploaded for this review")
    if version.status != "completed":
        raise HTTPException(400, "This round is not finished yet")

    redlines = sorted(
        [r for r in review.redlines if r.version_id == version.id],
        key=lambda r: (SEVERITY_ORDER.get(r.classification, 9), r.sort_order),
    )
    return review, version, redlines


@router.get("/{review_id}/export/redline")
def export_redline(
    review_id: int, version_id: int | None = None, db: Session = Depends(get_db)
):
    """The marked-up contract, as a Word file with real tracked changes.

    Written into the round's own file, so a round-three redline marks up what
    the counterparty last sent rather than the paper they opened with.
    """
    review, version, redlines = _export_target(review_id, version_id, db)
    if not os.path.exists(version.file_path):
        raise HTTPException(404, "The uploaded file is missing on disk")

    included = exportable_redlines(redlines)
    data, faithful = export_redline_docx(review, version, redlines)
    suffix = "" if faithful else "_reconstructed"
    filename = (
        f"Redline_{_safe_name(review.name)}_R{version.round_number}{suffix}.docx"
    )
    return Response(
        content=data,
        media_type=DOCX_MEDIA,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Export-Faithful": "true" if faithful else "false",
            # How many edits were written. Only accepted and reworded redlines
            # go to the counterparty, so this is usually fewer than the findings
            # on screen - the UI says so rather than letting it surprise anyone.
            "X-Export-Edits": str(len(included)),
        },
    )


@router.get("/{review_id}/export/issues")
def export_issues(
    review_id: int, version_id: int | None = None, db: Session = Depends(get_db)
):
    """The issues list, as a table - the dense tabular summary for circulation."""
    review, version, redlines = _export_target(review_id, version_id, db)
    data = generate_issues_list_docx(review, version, redlines)
    filename = f"IssuesList_{_safe_name(review.name)}_R{version.round_number}.docx"
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
    for version in review.versions:
        if version.file_path and os.path.exists(version.file_path):
            os.remove(version.file_path)
    db.delete(review)
    db.commit()
