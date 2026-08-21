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


def _run_light_migrations():
    """Add columns introduced after the initial schema.

    create_all only creates missing tables, it never alters existing ones, so a
    database created before a column existed keeps working without it and then
    fails on first query.
    """
    from sqlalchemy import text

    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(redlines)"))}
        if "covers" not in cols:
            conn.execute(text("ALTER TABLE redlines ADD COLUMN covers TEXT"))


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
