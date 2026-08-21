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


class Specification(Base):
    __tablename__ = "specifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    extraction_status: Mapped[str] = mapped_column(String(50), default="pending")
    # pending | processing | completed | failed
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    sessions: Mapped[list["AnalysisSession"]] = relationship(
        "AnalysisSession", back_populates="specification"
    )


class AnalysisSession(Base):
    __tablename__ = "analysis_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    spec_id: Mapped[int] = mapped_column(Integer, ForeignKey("specifications.id"))
    urs_name: Mapped[str] = mapped_column(String(255), nullable=False)
    urs_file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    urs_file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    urs_extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    # pending | extracting | analyzing | completed | failed
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_requirements: Mapped[int] = mapped_column(Integer, default=0)
    analyzed_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    specification: Mapped["Specification"] = relationship(
        "Specification", back_populates="sessions"
    )
    requirements: Mapped[list["Requirement"]] = relationship(
        "Requirement", back_populates="session", cascade="all, delete-orphan"
    )


class Requirement(Base):
    __tablename__ = "requirements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("analysis_sessions.id")
    )
    req_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    req_text: Mapped[str] = mapped_column(Text, nullable=False)
    # Page of the URS document the requirement was found on (PDF only)
    urs_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    classification: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # COMPLIANT | ACCEPTABLE_DEVIATION | CRITICAL_DEVIATION | NOT_APPLICABLE
    spec_reference: Mapped[str | None] = mapped_column(Text, nullable=True)
    deviation_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    analyzed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    session: Mapped["AnalysisSession"] = relationship(
        "AnalysisSession", back_populates="requirements"
    )
