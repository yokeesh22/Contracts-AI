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


class RedlineOut(BaseModel):
    id: int
    review_id: int
    sort_order: int

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

    status: str
    source: str
    is_manual_override: bool
    edited_at: datetime | None

    # Derived, never stored - see services/diff_util.py for why.
    diff: list[DiffOp] = []
    words_added: int = 0
    words_removed: int = 0
    rule_title: str | None = None

    class Config:
        from_attributes = True


class RedlineUpdate(BaseModel):
    """A user's edit. Any field present is applied; the rest are untouched."""

    proposed_text: str | None = None
    rationale: str | None = None
    classification: str | None = None
    status: str | None = None


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
class ContractReviewOut(BaseModel):
    id: int
    playbook_id: int
    name: str
    counterparty: str | None
    file_name: str
    doc_kind: str
    status: str
    error_message: str | None
    total_clauses: int
    analyzed_count: int
    created_at: datetime
    completed_at: datetime | None

    class Config:
        from_attributes = True


class DocumentBlock(BaseModel):
    index: int
    kind: str
    section: str
    text: str
    page: int | None = None


class ContractReviewDetail(ContractReviewOut):
    playbook: PlaybookOut
    redlines: list[RedlineOut]
    blocks: list[DocumentBlock] = []
    sections: list[str] = []
    # False for PDF uploads, where the vendor's original formatting cannot be
    # preserved in the exported Word file. The UI warns on this.
    export_is_faithful: bool = True
