from datetime import datetime
from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="Analyst")
    # Administrator | Analyst | Viewer
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class Playbook(Base):
    """A named set of negotiating positions that contracts get reviewed against.

    This is the ground truth for redlining - the contract-law analogue of the
    technical specification the old deviation analyzer compared against. It is
    a rule set rather than a document, because legal teams negotiate against
    standing positions per clause type, not against a counterpart contract.
    """

    __tablename__ = "playbooks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Which side of the table we are on. Every rule is written from this
    # party's perspective; STERIS is the customer in every known use case.
    our_party: Mapped[str] = mapped_column(String(50), default="Customer")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )

    rules: Mapped[list["PlaybookRule"]] = relationship(
        "PlaybookRule",
        back_populates="playbook",
        cascade="all, delete-orphan",
        order_by="PlaybookRule.sort_order",
    )
    reviews: Mapped[list["ContractReview"]] = relationship(
        "ContractReview", back_populates="playbook"
    )


class PlaybookRule(Base):
    """One negotiating position: what we want, what we settle for, when to walk.

    `standard_language` is the fallback replacement text the redline engine
    proposes when it cannot draft something better tailored to the clause it
    actually found.
    """

    __tablename__ = "playbook_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    playbook_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("playbooks.id"), index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    clause_type: Mapped[str] = mapped_column(String(100), nullable=False)
    # e.g. LIABILITY_CAP, AI_TRAINING, GOVERNING_LAW - the join key between a
    # clause found in a contract and the position we hold on it.
    title: Mapped[str] = mapped_column(String(255), nullable=False)

    preferred_position: Mapped[str] = mapped_column(Text, nullable=False)
    fallback_position: Mapped[str | None] = mapped_column(Text, nullable=True)
    walkaway_position: Mapped[str | None] = mapped_column(Text, nullable=True)

    standard_language: Mapped[str | None] = mapped_column(Text, nullable=True)
    guidance: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Where this position came from - a citation into the sample contracts, or
    # "Business team" once legal supplies the real playbook. Kept visible in the
    # UI so nobody mistakes an inferred position for an approved one.
    basis: Mapped[str | None] = mapped_column(Text, nullable=True)

    severity: Mapped[str] = mapped_column(String(50), default="NEGOTIABLE")
    # UNACCEPTABLE | NEGOTIABLE | ACCEPTABLE - the classification applied when
    # a contract's clause fails this rule.
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    # If true and no matching clause is found, the review raises a MISSING
    # finding. This is how absent protections (no breach notification, no audit
    # right) get surfaced - they have no text to anchor to.
    detection_hints: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    playbook: Mapped["Playbook"] = relationship("Playbook", back_populates="rules")


class ContractReview(Base):
    """One uploaded contract, reviewed against one playbook."""

    __tablename__ = "contract_reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    playbook_id: Mapped[int] = mapped_column(Integer, ForeignKey("playbooks.id"))

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    counterparty: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    doc_kind: Mapped[str] = mapped_column(String(10), default="docx")
    # docx | pdf - drives whether a true tracked-changes export is possible.
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The block-level render model (JSON) that both the on-screen document pane
    # and the export are built from. See services/document_model.py.
    blocks_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(50), default="pending")
    # pending | extracting | analyzing | completed | failed
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_clauses: Mapped[int] = mapped_column(Integer, default=0)
    analyzed_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    playbook: Mapped["Playbook"] = relationship("Playbook", back_populates="reviews")
    redlines: Mapped[list["Redline"]] = relationship(
        "Redline",
        back_populates="review",
        cascade="all, delete-orphan",
        order_by="Redline.sort_order",
    )


class Redline(Base):
    """One finding against one clause, and the edit proposed to fix it.

    Deliberately stores the *edit*, never the rendered result: the on-screen
    redline, the clean "final" view and the tracked-changes .docx are all
    renderers over these fields. That is what keeps a user's edit reflected
    everywhere at once instead of drifting between views.
    """

    __tablename__ = "redlines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    review_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("contract_reviews.id"), index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # --- where in the document -------------------------------------------
    doc_section: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # "Main Agreement", "Exhibit C - AI Addendum". Drives the document tabs;
    # one uploaded file routinely carries several agreements (the Vimeo sample
    # has an SLA, a DPA and an AI Addendum as exhibits).
    clause_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)
    clause_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    block_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    block_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # --- what it says and what we want it to say --------------------------
    clause_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # The other positions this same clause also fails, as a JSON list of clause
    # types. One paragraph often engages several — a liability cap can be both
    # one-sided and missing its carve-outs — and they resolve as a single edit,
    # because two edits to one paragraph cannot both survive into the export.
    covers: Mapped[str | None] = mapped_column(Text, nullable=True)
    rule_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("playbook_rules.id"), nullable=True
    )
    original_text: Mapped[str] = mapped_column(Text, default="")
    # Empty for a MISSING finding - there is no vendor text to strike.
    proposed_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    classification: Mapped[str] = mapped_column(String(50), default="NEGOTIABLE")
    # UNACCEPTABLE | NEGOTIABLE | ACCEPTABLE | MISSING
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Becomes the margin comment in the exported Word file.

    # --- review state ------------------------------------------------------
    status: Mapped[str] = mapped_column(String(50), default="suggested")
    # suggested | accepted | rejected | modified
    source: Mapped[str] = mapped_column(String(20), default="ai")
    # ai | user - user-authored redlines cover what the model missed.
    is_manual_override: Mapped[bool] = mapped_column(Boolean, default=False)
    # Set once a human touches the text, so re-running the analysis never
    # silently destroys someone's edit.
    edited_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    edited_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    review: Mapped["ContractReview"] = relationship(
        "ContractReview", back_populates="redlines"
    )
    rule: Mapped["PlaybookRule | None"] = relationship("PlaybookRule")
    editor: Mapped["User | None"] = relationship("User")
