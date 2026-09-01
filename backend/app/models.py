from datetime import datetime
from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

# --- vocabulary -------------------------------------------------------------
# Two status axes, deliberately kept apart. A round's status is machine state
# and is never set by a human; a negotiation's status is where the deal stands
# and is partly human-owned, because the app cannot observe an email being sent.

ROUND_STATUSES = ("queued", "extracting", "analyzing", "completed", "failed")

NEGOTIATION_STATUSES = (
    "ai_in_progress",  # a round is being processed        (automatic)
    "ai_completed",    # analysis done, nobody has looked  (automatic)
    "in_process",      # a reviewer is working the redlines(automatic)
    "pending_vendor",  # sent out, waiting on them         (manual)
    "completed",       # closed                            (manual)
    "failed",          # the current round could not be processed
)

ISSUE_STATUSES = (
    "open",       # raised, unresolved
    "countered",  # they proposed something else that still does not satisfy us
    "agreed",     # settled, either way
    "conceded",   # we gave it up
    "dropped",    # withdrawn by a reviewer
)

# What the counterparty did to a position we put to them last round. Derived by
# diffing their returned document, never by asking the model.
VENDOR_ACTIONS = (
    # --- points we actually put to them ---------------------------------
    "accepted",   # our language came back intact
    "rejected",   # reverted to their original wording
    "countered",  # changed to something that is neither
    "ignored",    # required protection they simply did not add
    "removed",    # the clause is gone from the document entirely
    # --- points we never sent -------------------------------------------
    # Only accepted and reworded redlines go into the exported file, so a
    # finding nobody ruled on was never seen by the counterparty. Reporting it
    # as "they left it as drafted" blames them for a question they were never
    # asked, and buries the handful of clauses that did move under everything
    # that never left the building.
    "not_raised",  # we did not ask, and the clause is unchanged
    "revised",     # we did not ask, but they rewrote it anyway
)


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
    """One negotiation: a deal with a counterparty, run over several rounds.

    Deliberately no longer "one uploaded file". A contract goes out redlined,
    comes back changed, goes out again; the deal is the thing that persists and
    the file is only ever a snapshot of it. Everything file-shaped - the upload,
    the block model, the extraction state - lives on ContractVersion, and every
    negotiating point that outlives a single round lives on Issue.
    """

    __tablename__ = "contract_reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    playbook_id: Mapped[int] = mapped_column(Integer, ForeignKey("playbooks.id"))

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    counterparty: Mapped[str | None] = mapped_column(String(255), nullable=True)

    status: Mapped[str] = mapped_column(String(50), default="ai_in_progress")
    # See NEGOTIATION_STATUSES. Only pending_vendor and completed are set by a
    # human; the rest follow from what the app can actually observe.
    status_changed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # When the redline was handed to the counterparty. The app cannot see the
    # email, so this is recorded by the "Sent to vendor" action - and it is what
    # powers the "waiting 12 days" ageing that a contracts team actually reads.
    sent_to_vendor_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    current_round: Mapped[int] = mapped_column(Integer, default=1)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    playbook: Mapped["Playbook"] = relationship("Playbook", back_populates="reviews")
    versions: Mapped[list["ContractVersion"]] = relationship(
        "ContractVersion",
        back_populates="review",
        cascade="all, delete-orphan",
        order_by="ContractVersion.round_number",
    )
    issues: Mapped[list["Issue"]] = relationship(
        "Issue",
        back_populates="review",
        cascade="all, delete-orphan",
        order_by="Issue.id",
    )
    # Declared here rather than on ContractVersion so exactly one relationship
    # owns the cascade; the per-version and per-issue views below are read-only.
    redlines: Mapped[list["Redline"]] = relationship(
        "Redline",
        back_populates="review",
        cascade="all, delete-orphan",
        order_by="Redline.sort_order",
    )
    status_events: Mapped[list["StatusEvent"]] = relationship(
        "StatusEvent",
        back_populates="review",
        cascade="all, delete-orphan",
        order_by="StatusEvent.created_at",
    )


class ContractVersion(Base):
    """One document version in the negotiation - one round of the back-and-forth.

    Round 1 is the counterparty's opening paper. Every later round is the file
    they send back after we redline it. Each version owns its own block model
    because block indices cannot survive a version change: the moment they
    insert a paragraph, every index below it shifts. What survives across rounds
    is the Issue, not the anchor.
    """

    __tablename__ = "contract_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    review_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("contract_reviews.id"), index=True
    )
    round_number: Mapped[int] = mapped_column(Integer, default=1)
    direction: Mapped[str] = mapped_column(String(20), default="inbound")
    # inbound - received from the counterparty (every version we analyse)
    # outbound - reserved for a version we author from scratch

    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    doc_kind: Mapped[str] = mapped_column(String(10), default="docx")
    # docx | pdf - drives whether a true tracked-changes export is possible.
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The block-level render model (JSON) that both the on-screen document pane
    # and the export are built from. See services/document_model.py.
    blocks_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The counterparty's own tracked changes and margin comments, lifted out of
    # the returned .docx. Their comments say why they pushed back, which is
    # better signal on the landing zone than the redline itself.
    annotations_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    has_tracked_changes: Mapped[bool] = mapped_column(Boolean, default=False)

    status: Mapped[str] = mapped_column(String(50), default="queued")
    # See ROUND_STATUSES. Machine state only - never set by a human.
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_clauses: Mapped[int] = mapped_column(Integer, default=0)
    analyzed_count: Mapped[int] = mapped_column(Integer, default=0)

    # Set when this round's redline was handed to the counterparty.
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sent_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    review: Mapped["ContractReview"] = relationship(
        "ContractReview", back_populates="versions"
    )
    redlines: Mapped[list["Redline"]] = relationship(
        "Redline",
        primaryjoin="ContractVersion.id == Redline.version_id",
        order_by="Redline.sort_order",
        viewonly=True,
    )


class Issue(Base):
    """One negotiating point, carried across every round until it is settled.

    This is what makes a second round worth anything. Without it, round 3 would
    re-raise the same forty findings from scratch and a reviewer would have no
    way to tell what they had already won from what they had already conceded.
    Each round contributes one Redline to the thread - our position on this
    point in that round - and the Issue records where the point itself stands.
    """

    __tablename__ = "issues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    review_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("contract_reviews.id"), index=True
    )

    clause_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    clause_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)
    doc_section: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rule_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("playbook_rules.id"), nullable=True
    )

    status: Mapped[str] = mapped_column(String(50), default="open")
    # See ISSUE_STATUSES.
    first_round: Mapped[int] = mapped_column(Integer, default=1)
    resolved_round: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # True when the point exists only because the counterparty inserted new
    # language in a later round. Their edits are where fresh risk enters, so
    # these are surfaced separately from the positions we opened with.
    is_vendor_introduced: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )

    review: Mapped["ContractReview"] = relationship(
        "ContractReview", back_populates="issues"
    )
    rule: Mapped["PlaybookRule | None"] = relationship("PlaybookRule")
    redlines: Mapped[list["Redline"]] = relationship(
        "Redline",
        primaryjoin="Issue.id == Redline.issue_id",
        order_by="Redline.id",
        viewonly=True,
    )


class Redline(Base):
    """Our position on one issue, in one round, and the edit that would fix it.

    Deliberately stores the *edit*, never the rendered result: the on-screen
    redline, the clean "final" view and the tracked-changes .docx are all
    renderers over these fields. That is what keeps a user's edit reflected
    everywhere at once instead of drifting between views.

    From round two onwards a redline also records what the counterparty did to
    our previous ask, so the card can show the whole thread - what we wanted,
    what they gave, what we want now.
    """

    __tablename__ = "redlines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    review_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("contract_reviews.id"), index=True
    )
    version_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("contract_versions.id"), index=True, nullable=True
    )
    issue_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("issues.id"), index=True, nullable=True
    )
    # Our ask on this same issue in the previous round, so the thread can be
    # walked backwards without re-deriving it from timestamps.
    prior_redline_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("redlines.id"), nullable=True
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
    # How the clause reads in THIS version - which from round two is the
    # counterparty's revised wording, not their opening wording.
    # Empty for a MISSING finding - there is no vendor text to strike.
    proposed_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    classification: Mapped[str] = mapped_column(String(50), default="NEGOTIABLE")
    # UNACCEPTABLE | NEGOTIABLE | ACCEPTABLE | MISSING
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Becomes the margin comment in the exported Word file.

    # --- what the counterparty did last round ------------------------------
    vendor_action: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # See VENDOR_ACTIONS. Null means this point was first raised in this round.
    vendor_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Their margin comment on this clause, if they left one. Usually the most
    # informative thing in the returned file.
    is_vendor_introduced: Mapped[bool] = mapped_column(Boolean, default=False)

    # --- review state ------------------------------------------------------
    status: Mapped[str] = mapped_column(String(50), default="suggested")
    # suggested | accepted | rejected | modified. "rejected" means we leave the
    # clause as the counterparty wrote it, which from round two is also how
    # "accept their counter" is recorded - the export writes no edit either way.
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
    version: Mapped["ContractVersion | None"] = relationship(
        "ContractVersion",
        primaryjoin="ContractVersion.id == Redline.version_id",
        viewonly=True,
    )
    issue: Mapped["Issue | None"] = relationship(
        "Issue", primaryjoin="Issue.id == Redline.issue_id", viewonly=True
    )
    rule: Mapped["PlaybookRule | None"] = relationship("PlaybookRule")
    editor: Mapped["User | None"] = relationship("User", foreign_keys=[edited_by])


class StatusEvent(Base):
    """Who moved the negotiation, when, and from what.

    Contract negotiation is auditable work: "who marked this complete" is a
    question that gets asked, and a status with no history cannot answer it.
    """

    __tablename__ = "status_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    review_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("contract_reviews.id"), index=True
    )
    from_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    to_status: Mapped[str] = mapped_column(String(50), nullable=False)
    round_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_manual: Mapped[bool] = mapped_column(Boolean, default=False)
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    review: Mapped["ContractReview"] = relationship(
        "ContractReview", back_populates="status_events"
    )
    user: Mapped["User | None"] = relationship("User")
