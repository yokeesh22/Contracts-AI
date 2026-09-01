from datetime import datetime

from pydantic import BaseModel


# --------------------------------------------------------------- playbook
class PlaybookRuleBase(BaseModel):
    clause_type: str
    title: str
    preferred_position: str
    fallback_position: str | None = None
    walkaway_position: str | None = None
    standard_language: str | None = None
    guidance: str | None = None
    basis: str | None = None
    severity: str = "NEGOTIABLE"
    is_required: bool = False
    detection_hints: str | None = None
    is_active: bool = True
    sort_order: int = 0


class PlaybookRuleCreate(PlaybookRuleBase):
    pass


class PlaybookRuleUpdate(BaseModel):
    """Every field optional - the Playbook Manager patches one at a time."""

    clause_type: str | None = None
    title: str | None = None
    preferred_position: str | None = None
    fallback_position: str | None = None
    walkaway_position: str | None = None
    standard_language: str | None = None
    guidance: str | None = None
    basis: str | None = None
    severity: str | None = None
    is_required: bool | None = None
    detection_hints: str | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class PlaybookRuleOut(PlaybookRuleBase):
    id: int
    playbook_id: int

    class Config:
        from_attributes = True


class PlaybookBase(BaseModel):
    name: str
    description: str | None = None
    our_party: str = "Customer"


class PlaybookCreate(PlaybookBase):
    pass


class PlaybookUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    our_party: str | None = None


class PlaybookOut(PlaybookBase):
    id: int
    is_default: bool
    created_at: datetime
    updated_at: datetime
    rule_count: int = 0

    class Config:
        from_attributes = True


class PlaybookDetail(PlaybookOut):
    rules: list[PlaybookRuleOut]


# --------------------------------------------------------------- redlines
class DiffOp(BaseModel):
    op: str  # equal | delete | insert
    text: str


class ThreadEntry(BaseModel):
    """One round of the conversation about a single negotiating point."""

    round: int
    redline_id: int
    our_proposal: str | None = None
    their_text: str | None = None
    vendor_action: str | None = None
    vendor_comment: str | None = None
    classification: str
    status: str


class RedlineOut(BaseModel):
    id: int
    review_id: int
    version_id: int | None = None
    issue_id: int | None = None
    prior_redline_id: int | None = None
    sort_order: int
    round_number: int = 1

    doc_section: str | None
    clause_ref: str | None
    clause_title: str | None
    block_start: int | None
    block_end: int | None
    page: int | None

    clause_type: str | None
    # Every position this one edit resolves; a clause often fails several.
    covers: list[str] = []
    rule_id: int | None
    original_text: str
    proposed_text: str | None
    classification: str
    rationale: str | None

    # What the counterparty did to our previous ask on this point, and what they
    # said about it. Null in round one, where there is no previous ask.
    vendor_action: str | None = None
    vendor_comment: str | None = None
    is_vendor_introduced: bool = False
    issue_status: str | None = None
    issue_first_round: int | None = None

    status: str
    source: str
    is_manual_override: bool
    edited_at: datetime | None

    # Derived, never stored - see services/diff_util.py for why.
    diff: list[DiffOp] = []
    words_added: int = 0
    words_removed: int = 0
    rule_title: str | None = None
    history: list[ThreadEntry] = []

    class Config:
        from_attributes = True


class RedlineUpdate(BaseModel):
    """A user's edit. Any field present is applied; the rest are untouched."""

    proposed_text: str | None = None
    rationale: str | None = None
    classification: str | None = None
    status: str | None = None
    # Settles the underlying negotiating point in the same call. "Accept their
    # counter" is one decision, and splitting it across two requests can leave
    # the redline moved and the ledger not.
    issue_status: str | None = None


class IssueOut(BaseModel):
    """A negotiating point as it stands, independent of any one round."""

    id: int
    clause_type: str | None
    title: str
    clause_ref: str | None
    doc_section: str | None
    status: str
    first_round: int
    resolved_round: int | None
    is_vendor_introduced: bool

    class Config:
        from_attributes = True


class IssueUpdate(BaseModel):
    status: str


class RedlineCreate(BaseModel):
    """A redline the reviewer adds themselves, for something the model missed."""

    clause_title: str
    clause_type: str | None = None
    doc_section: str | None = None
    block_start: int | None = None
    block_end: int | None = None
    original_text: str = ""
    proposed_text: str | None = None
    rationale: str | None = None
    classification: str = "NEGOTIABLE"


# ---------------------------------------------------------------- reviews
class ContractVersionOut(BaseModel):
    """One round: the document as it stood, and how far its analysis got."""

    id: int
    round_number: int
    direction: str
    file_name: str
    doc_kind: str
    status: str
    error_message: str | None = None
    total_clauses: int = 0
    analyzed_count: int = 0
    # True when the counterparty returned the file with their own revision
    # marks, which is what makes a precise reconciliation possible.
    has_tracked_changes: bool = False
    revision_authors: list[str] = []
    sent_at: datetime | None = None
    sent_note: str | None = None
    created_at: datetime
    completed_at: datetime | None = None


class RoundSummary(BaseModel):
    """A round as it appears on the list page's expanded row."""

    id: int
    round_number: int
    direction: str
    file_name: str
    doc_kind: str
    status: str
    has_tracked_changes: bool = False
    total_clauses: int = 0
    sent_at: datetime | None = None
    created_at: datetime


class StatusEventOut(BaseModel):
    from_status: str | None = None
    to_status: str
    round_number: int | None = None
    note: str | None = None
    is_manual: bool = False
    created_at: datetime


class VendorSend(BaseModel):
    """Recording that the redline actually left the building."""

    sent_at: datetime | None = None
    note: str | None = None


class StatusUpdate(BaseModel):
    status: str = "completed"
    note: str | None = None


class ContractReviewOut(BaseModel):
    """A negotiation as it appears in the list: where it stands, not what is in it."""

    id: int
    playbook_id: int
    name: str
    counterparty: str | None
    status: str
    current_round: int = 1
    total_rounds: int = 1
    # Every round of this negotiation, oldest first, so the list row can expand
    # into its history without a request per row.
    rounds: list[RoundSummary] = []
    open_issues: int = 0
    total_issues: int = 0
    # Taken from the most recent round, so the list can show what is on the desk
    # now without loading every version.
    file_name: str = ""
    doc_kind: str = "docx"
    round_status: str = "queued"
    error_message: str | None = None
    total_clauses: int = 0
    analyzed_count: int = 0
    sent_to_vendor_at: datetime | None = None
    status_changed_at: datetime | None = None
    last_activity_at: datetime | None = None
    created_at: datetime
    completed_at: datetime | None

    class Config:
        from_attributes = True


class BlockRevision(BaseModel):
    type: str  # insert | delete
    author: str
    text: str


class BlockComment(BaseModel):
    author: str
    text: str


class DocumentBlock(BaseModel):
    index: int
    kind: str  # heading | para | row
    section: str
    text: str
    page: int | None = None
    # Present on `row` blocks so the viewer can lay a table out as a table
    # rather than as one pipe-joined line. Order forms and fee schedules carry
    # negotiable terms, so they have to stay readable.
    cells: list[str] | None = None
    is_header: bool = False
    # The counterparty's own marks on this paragraph, present only on rounds
    # they sent back. Rendered in the document pane so a reviewer can see what
    # they changed, not only what our reconciliation concluded about it.
    revisions: list[BlockRevision] | None = None
    comments: list[BlockComment] | None = None


class ContractReviewDetail(ContractReviewOut):
    playbook: PlaybookOut
    # Every round, oldest first - the timeline strip across the top of the page.
    versions: list[ContractVersionOut] = []
    # The round currently being viewed; blocks and redlines below are its own.
    version: ContractVersionOut | None = None
    issues: list[IssueOut] = []
    redlines: list[RedlineOut]
    blocks: list[DocumentBlock] = []
    sections: list[str] = []
    status_events: list[StatusEventOut] = []
    # False for PDF uploads, where the vendor's original formatting cannot be
    # preserved in the exported Word file. The UI warns on this.
    export_is_faithful: bool = True
