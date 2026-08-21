import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base, SessionLocal
from .models import User
from .routers import specifications, deviation, stats, auth, users
from .config import settings
from .security import get_password_hash

# Create all tables
Base.metadata.create_all(bind=engine)


def _run_light_migrations():
    """Add columns introduced after the initial schema — create_all only
    creates missing tables, it never alters existing ones."""
    from sqlalchemy import text

    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(requirements)"))}
        if "urs_page" not in cols:
            conn.execute(text("ALTER TABLE requirements ADD COLUMN urs_page INTEGER"))


_run_light_migrations()

# Ensure upload directories exist
os.makedirs(os.path.join(settings.upload_dir, "specs"), exist_ok=True)
os.makedirs(os.path.join(settings.upload_dir, "urs"), exist_ok=True)


def _seed_superuser():
    """Create the first admin user from .env if no users exist."""
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            admin = User(
                name="Admin",
                email=settings.first_superuser.lower(),
                password_hash=get_password_hash(settings.first_superuser_password),
                role="Administrator",
                is_active=True,
            )
            db.add(admin)
            db.commit()
    finally:
        db.close()


_seed_superuser()

app = FastAPI(
    title="Deviation Analyzer API",
    description="Compare customer URS documents against technical specifications",
    version="1.0.0",
)

_origins = [o.strip() for o in settings.backend_cors_origins.strip('"').split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(specifications.router)
app.include_router(deviation.router)
app.include_router(stats.router)


@app.get("/health")
def health():
    return {"status": "ok"}
