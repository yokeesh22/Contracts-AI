import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, SessionLocal, engine
from .models import Playbook, PlaybookRule, User
from .routers import auth, playbooks, reviews, stats, users
from .security import get_password_hash
from .services.playbook_seed import SEED_RULES

Base.metadata.create_all(bind=engine)


def _columns(conn, table: str) -> set[str]:
    from sqlalchemy import text

    return {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})"))}


# Columns added to `redlines` when the schema grew a version and an issue to
# hang each finding on. create_all only creates missing tables; it never alters
# an existing one, so a database made before these existed keeps working without
# them and then fails on the first query that mentions one.
_REDLINE_COLUMNS = {
    "covers": "TEXT",
    "version_id": "INTEGER",
    "issue_id": "INTEGER",
    "prior_redline_id": "INTEGER",
    "vendor_action": "VARCHAR(20)",
    "vendor_comment": "TEXT",
    "is_vendor_introduced": "BOOLEAN DEFAULT 0",
}

_VERSION_COLUMNS = {
    "sent_redline_ids": "TEXT",
}

# The vendor-action vocabulary was consolidated: "they did not add the clause"
# and "they reverted my edit" are one decision, and an unprompted rewrite reads
# the same as brand-new language. Stored rows are rewritten rather than left to
# render under labels that no longer exist.
_ACTION_RENAMES = {
    "ignored": "rejected",
    "not_raised": "not_sent",
    "revised": "new_change",
}

_REVIEW_COLUMNS = {
    "status_changed_at": "DATETIME",
    "sent_to_vendor_at": "DATETIME",
    "last_activity_at": "DATETIME",
    "current_round": "INTEGER DEFAULT 1",
}

# The old single-file statuses, mapped onto where the negotiation now stands.
_STATUS_MAP = {
    "pending": "ai_in_progress",
    "extracting": "ai_in_progress",
    "analyzing": "ai_in_progress",
    "completed": "ai_completed",
    "failed": "failed",
}


def _run_light_migrations():
    """Bring an existing database up to the multi-round schema.

    The structural change is that a review is no longer one uploaded file: the
    file, the block model and the extraction state moved to contract_versions.
    Existing reviews are rewritten as round one of themselves rather than
    discarded, because a database with real reviews in it is the normal case by
    the time a schema changes.
    """
    from sqlalchemy import text

    with engine.begin() as conn:
        redline_cols = _columns(conn, "redlines")
        for name, ddl in _REDLINE_COLUMNS.items():
            if name not in redline_cols:
                conn.execute(text(f"ALTER TABLE redlines ADD COLUMN {name} {ddl}"))

        version_cols = _columns(conn, "contract_versions")
        for name, ddl in _VERSION_COLUMNS.items():
            if version_cols and name not in version_cols:
                conn.execute(
                    text(f"ALTER TABLE contract_versions ADD COLUMN {name} {ddl}")
                )

        if "vendor_action" in _columns(conn, "redlines"):
            for was, now in _ACTION_RENAMES.items():
                conn.execute(
                    text("UPDATE redlines SET vendor_action = :now WHERE vendor_action = :was"),
                    {"now": now, "was": was},
                )

        review_cols = _columns(conn, "contract_reviews")
        if not review_cols:
            return

        if "file_path" not in review_cols:
            for name, ddl in _REVIEW_COLUMNS.items():
                if name not in review_cols:
                    conn.execute(
                        text(f"ALTER TABLE contract_reviews ADD COLUMN {name} {ddl}")
                    )
            return

        # --- one round per existing review --------------------------------
        rows = conn.execute(
            text(
                "SELECT id, file_name, file_path, doc_kind, extracted_text, "
                "blocks_json, status, error_message, total_clauses, "
                "analyzed_count, created_at, completed_at FROM contract_reviews"
            )
        ).fetchall()

        for row in rows:
            existing = conn.execute(
                text("SELECT id FROM contract_versions WHERE review_id = :rid"),
                {"rid": row[0]},
            ).fetchone()
            if existing:
                continue
            conn.execute(
                text(
                    "INSERT INTO contract_versions (review_id, round_number, "
                    "direction, file_name, file_path, doc_kind, extracted_text, "
                    "blocks_json, status, error_message, total_clauses, "
                    "analyzed_count, has_tracked_changes, created_at, completed_at) "
                    "VALUES (:rid, 1, 'inbound', :fn, :fp, :dk, :tx, :bj, :st, "
                    ":em, :tc, :ac, 0, :ca, :ct)"
                ),
                {
                    "rid": row[0], "fn": row[1], "fp": row[2], "dk": row[3],
                    "tx": row[4], "bj": row[5], "st": row[6], "em": row[7],
                    "tc": row[8], "ac": row[9], "ca": row[10], "ct": row[11],
                },
            )
            version_id = conn.execute(
                text("SELECT id FROM contract_versions WHERE review_id = :rid"),
                {"rid": row[0]},
            ).fetchone()[0]
            conn.execute(
                text(
                    "UPDATE redlines SET version_id = :vid WHERE review_id = :rid "
                    "AND version_id IS NULL"
                ),
                {"vid": version_id, "rid": row[0]},
            )

        # --- one issue per existing finding --------------------------------
        # Every finding already made in an old review is a negotiating point;
        # threading them now means the next round reconciles against them
        # instead of starting the deal over.
        for redline in conn.execute(
            text(
                "SELECT id, review_id, clause_type, clause_title, clause_ref, "
                "doc_section, rule_id, status FROM redlines WHERE issue_id IS NULL"
            )
        ).fetchall():
            resolved = redline[7] in ("accepted", "rejected")
            conn.execute(
                text(
                    "INSERT INTO issues (review_id, clause_type, title, clause_ref, "
                    "doc_section, rule_id, status, first_round, resolved_round, "
                    "is_vendor_introduced, created_at, updated_at) VALUES "
                    "(:rid, :ct, :ti, :cr, :ds, :ru, :st, 1, :rr, 0, "
                    "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                ),
                {
                    "rid": redline[1],
                    "ct": redline[2],
                    "ti": redline[3] or redline[2] or "Untitled point",
                    "cr": redline[4],
                    "ds": redline[5],
                    "ru": redline[6],
                    "st": "agreed" if resolved else "open",
                    "rr": 1 if resolved else None,
                },
            )
            issue_id = conn.execute(text("SELECT last_insert_rowid()")).scalar()
            conn.execute(
                text("UPDATE redlines SET issue_id = :iid WHERE id = :id"),
                {"iid": issue_id, "id": redline[0]},
            )

        # --- rebuild contract_reviews without the file-shaped columns ------
        # SQLite cannot portably drop a NOT NULL column, and leaving file_path
        # behind would make every new insert fail. Copy-and-rename is the
        # supported way to change a table's shape.
        conn.execute(text("ALTER TABLE contract_reviews RENAME TO contract_reviews_old"))
        conn.execute(
            text(
                "CREATE TABLE contract_reviews ("
                "id INTEGER NOT NULL PRIMARY KEY, "
                "playbook_id INTEGER NOT NULL REFERENCES playbooks(id), "
                "name VARCHAR(255) NOT NULL, "
                "counterparty VARCHAR(255), "
                "status VARCHAR(50), "
                "status_changed_at DATETIME, "
                "sent_to_vendor_at DATETIME, "
                "last_activity_at DATETIME, "
                "current_round INTEGER DEFAULT 1, "
                "created_at DATETIME, "
                "completed_at DATETIME)"
            )
        )
        case = " ".join(
            f"WHEN '{was}' THEN '{now}'" for was, now in _STATUS_MAP.items()
        )
        conn.execute(
            text(
                "INSERT INTO contract_reviews (id, playbook_id, name, counterparty, "
                "status, status_changed_at, last_activity_at, current_round, "
                "created_at, completed_at) SELECT id, playbook_id, name, "
                f"counterparty, CASE status {case} ELSE 'ai_completed' END, "
                "created_at, created_at, 1, created_at, completed_at "
                "FROM contract_reviews_old"
            )
        )
        conn.execute(text("DROP TABLE contract_reviews_old"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_contract_reviews_id "
                "ON contract_reviews (id)"
            )
        )


_run_light_migrations()

os.makedirs(os.path.join(settings.upload_dir, "contracts"), exist_ok=True)


def _seed_superuser():
    """Create the first admin user from .env if no users exist."""
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            db.add(
                User(
                    name="Admin",
                    email=settings.first_superuser.lower(),
                    password_hash=get_password_hash(settings.first_superuser_password),
                    role="Administrator",
                    is_active=True,
                )
            )
            db.commit()
    finally:
        db.close()


def _seed_playbook():
    """Install the starting playbook on first run.

    Seeded once and never re-applied, so edits made in the Playbook Manager are
    never silently reverted on restart. To pull in new seed rules after the
    business team supplies real positions, add them through the UI or delete the
    default playbook first.
    """
    db = SessionLocal()
    try:
        if db.query(Playbook).count() > 0:
            return
        playbook = Playbook(
            name="STERIS Vendor Playbook (starter)",
            description=(
                "Starting positions inferred from the sample vendor agreements, "
                "not yet approved by legal. Each rule cites the evidence behind "
                "it. Replace these with the business team's real positions as "
                "they are confirmed."
            ),
            our_party="Customer",
            is_default=True,
        )
        db.add(playbook)
        db.flush()

        for order, rule in enumerate(SEED_RULES):
            db.add(PlaybookRule(playbook_id=playbook.id, sort_order=order, **rule))
        db.commit()
    finally:
        db.close()


_seed_superuser()
_seed_playbook()

app = FastAPI(
    title="Contracts.AI API",
    description="Redline uploaded contracts against a negotiating playbook",
    version="1.0.0",
)

_origins = [o.strip() for o in settings.backend_cors_origins.strip('"').split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Export-Faithful"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(playbooks.router)
app.include_router(reviews.router)
app.include_router(stats.router)


@app.get("/health")
def health():
    return {"status": "ok"}
