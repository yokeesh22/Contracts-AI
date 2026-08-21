import os
import shutil
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from ..database import get_db, SessionLocal
from ..models import Specification, AnalysisSession, Requirement
from ..schemas import AnalysisSessionOut, AnalysisSessionDetail
from ..services.document_extractor import extract_text_from_file
from ..services.deviation_engine import extract_requirements, analyze_requirement
from ..services.export_service import generate_exception_list_docx
from ..config import settings

router = APIRouter(prefix="/deviation", tags=["deviation"])

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc"}


def _save_upload(upload: UploadFile, subfolder: str) -> tuple[str, str]:
    ext = os.path.splitext(upload.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type '{ext}'. Allowed: {ALLOWED_EXTENSIONS}")
    unique_name = f"{uuid.uuid4().hex}{ext}"
    dest = os.path.join(settings.upload_dir, subfolder, unique_name)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as f:
        shutil.copyfileobj(upload.file, f)
    return upload.filename or unique_name, dest


def _run_analysis(session_id: int):
    """Background task: opens its own DB session so it outlives the HTTP request.

    Synchronous on purpose — Starlette executes sync background tasks in a
    worker thread, so the blocking Azure/OpenAI calls below no longer stall
    the event loop (which previously froze every other API request until
    the analysis finished).
    """
    db: Session = SessionLocal()
    try:
        session = db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        if not session:
            return

        spec = db.query(Specification).filter(Specification.id == session.spec_id).first()
        if not spec or not spec.extracted_text:
            session.status = "failed"
            session.error_message = "Specification text not available. Re-upload the specification."
            db.commit()
            return

        # Step 1 — extract URS text
        session.status = "extracting"
        db.commit()
        urs_text = extract_text_from_file(session.urs_file_path)
        session.urs_extracted_text = urs_text
        db.commit()

        # Step 2 — parse individual requirements from URS via OpenAI
        session.status = "analyzing"
        db.commit()
        raw_reqs = extract_requirements(urs_text)
        session.total_requirements = len(raw_reqs)
        db.commit()

        # Step 3 — compare each requirement against spec
        for item in raw_reqs:
            req_text = item.get("req_text", "").strip()
            if not req_text:
                continue
            result = analyze_requirement(req_text, spec.extracted_text)
            try:
                urs_page = int(item.get("urs_page")) if item.get("urs_page") is not None else None
            except (TypeError, ValueError):
                urs_page = None
            req = Requirement(
                session_id=session_id,
                req_number=item.get("req_number"),
                req_text=req_text,
                urs_page=urs_page,
                classification=result["classification"],
                spec_reference=result["spec_reference"],
                deviation_detail=result["deviation_detail"],
                remarks=result["remarks"],
                analyzed_at=datetime.utcnow(),
            )
            db.add(req)
            session.analyzed_count += 1
            db.commit()

        session.status = "completed"
        session.completed_at = datetime.utcnow()
        db.commit()

    except Exception as exc:
        try:
            session = db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
            if session:
                session.status = "failed"
                session.error_message = str(exc)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.post("", response_model=AnalysisSessionOut, status_code=201)
async def create_analysis(
    background_tasks: BackgroundTasks,
    spec_id: int = Form(...),
    urs_name: str = Form(...),
    urs_file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a URS and start deviation analysis against the selected specification."""
    spec = db.query(Specification).filter(Specification.id == spec_id).first()
    if not spec:
        raise HTTPException(404, "Specification not found")
    if spec.extraction_status != "completed":
        raise HTTPException(400, "Specification extraction is not complete yet. Please wait.")

    file_name, file_path = _save_upload(urs_file, "urs")
    session = AnalysisSession(
        spec_id=spec_id,
        urs_name=urs_name,
        urs_file_name=file_name,
        urs_file_path=file_path,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    # Pass only session_id — the background task opens its own DB session
    background_tasks.add_task(_run_analysis, session.id)
    return session


@router.get("", response_model=list[AnalysisSessionOut])
def list_sessions(db: Session = Depends(get_db)):
    return (
        db.query(AnalysisSession)
        .order_by(AnalysisSession.created_at.desc())
        .all()
    )


@router.get("/{session_id}", response_model=AnalysisSessionDetail)
def get_session(session_id: int, db: Session = Depends(get_db)):
    session = (
        db.query(AnalysisSession)
        .filter(AnalysisSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(404, "Analysis session not found")
    return session


MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
}


@router.get("/{session_id}/urs-file")
def get_urs_file(session_id: int, db: Session = Depends(get_db)):
    """Serve the original uploaded URS document inline (used by the viewer page)."""
    session = db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Analysis session not found")
    if not os.path.exists(session.urs_file_path):
        raise HTTPException(404, "URS file is missing on disk")
    ext = os.path.splitext(session.urs_file_path)[1].lower()
    return FileResponse(
        session.urs_file_path,
        media_type=MEDIA_TYPES.get(ext, "application/octet-stream"),
        headers={"Content-Disposition": f'inline; filename="{session.urs_file_name}"'},
    )


@router.get("/{session_id}/export")
def export_exception_list(session_id: int, db: Session = Depends(get_db)):
    """Download the Customer Exception List as a Word document."""
    session = (
        db.query(AnalysisSession)
        .filter(AnalysisSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(404, "Analysis session not found")
    if session.status != "completed":
        raise HTTPException(400, "Analysis is not complete yet")

    doc_bytes = generate_exception_list_docx(session, session.requirements)
    safe_name = session.urs_name.replace(" ", "_").replace("/", "-")
    filename = f"CustomerExceptionList_{safe_name}.docx"
    return Response(
        content=doc_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/{session_id}", status_code=204)
def delete_session(session_id: int, db: Session = Depends(get_db)):
    session = db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Analysis session not found")
    if os.path.exists(session.urs_file_path):
        os.remove(session.urs_file_path)
    db.delete(session)
    db.commit()
