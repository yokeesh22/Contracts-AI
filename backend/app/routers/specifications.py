import os
import shutil
import uuid
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db, SessionLocal
from ..models import Specification
from ..schemas import SpecificationOut, SpecificationDetail
from ..services.document_extractor import extract_text_from_file
from ..config import settings

router = APIRouter(prefix="/specifications", tags=["specifications"])

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc"}


def _save_upload(upload: UploadFile) -> tuple[str, str]:
    ext = os.path.splitext(upload.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type '{ext}'. Allowed: {ALLOWED_EXTENSIONS}")
    unique_name = f"{uuid.uuid4().hex}{ext}"
    dest = os.path.join(settings.upload_dir, "specs", unique_name)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as f:
        shutil.copyfileobj(upload.file, f)
    return upload.filename or unique_name, dest


def _run_extraction(spec_id: int, file_path: str):
    """Background task: opens its own DB session so it outlives the HTTP request.

    Synchronous on purpose — Starlette executes sync background tasks in a
    worker thread, keeping the event loop free while Azure extraction runs.
    """
    db: Session = SessionLocal()
    try:
        spec = db.query(Specification).filter(Specification.id == spec_id).first()
        if not spec:
            return
        spec.extraction_status = "processing"
        db.commit()
        text = extract_text_from_file(file_path)
        spec.extracted_text = text
        spec.extraction_status = "completed"
        db.commit()
    except Exception as exc:
        try:
            spec = db.query(Specification).filter(Specification.id == spec_id).first()
            if spec:
                spec.extraction_status = "failed"
                spec.error_message = str(exc)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.post("", response_model=SpecificationOut, status_code=201)
async def upload_specification(
    background_tasks: BackgroundTasks,
    name: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    file_name, file_path = _save_upload(file)
    spec = Specification(name=name, file_name=file_name, file_path=file_path)
    db.add(spec)
    db.commit()
    db.refresh(spec)
    # Pass only IDs — background task creates its own session
    background_tasks.add_task(_run_extraction, spec.id, file_path)
    return spec


@router.get("", response_model=list[SpecificationOut])
def list_specifications(db: Session = Depends(get_db)):
    return db.query(Specification).order_by(Specification.created_at.desc()).all()


@router.get("/{spec_id}", response_model=SpecificationDetail)
def get_specification(spec_id: int, db: Session = Depends(get_db)):
    spec = db.query(Specification).filter(Specification.id == spec_id).first()
    if not spec:
        raise HTTPException(404, "Specification not found")
    return spec


MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
}


@router.get("/{spec_id}/file")
def get_specification_file(spec_id: int, db: Session = Depends(get_db)):
    """Serve the original uploaded document inline (used by the viewer page)."""
    spec = db.query(Specification).filter(Specification.id == spec_id).first()
    if not spec:
        raise HTTPException(404, "Specification not found")
    if not os.path.exists(spec.file_path):
        raise HTTPException(404, "Specification file is missing on disk")
    ext = os.path.splitext(spec.file_path)[1].lower()
    return FileResponse(
        spec.file_path,
        media_type=MEDIA_TYPES.get(ext, "application/octet-stream"),
        headers={"Content-Disposition": f'inline; filename="{spec.file_name}"'},
    )


@router.delete("/{spec_id}", status_code=204)
def delete_specification(spec_id: int, db: Session = Depends(get_db)):
    spec = db.query(Specification).filter(Specification.id == spec_id).first()
    if not spec:
        raise HTTPException(404, "Specification not found")
    if os.path.exists(spec.file_path):
        os.remove(spec.file_path)
    db.delete(spec)
    db.commit()
