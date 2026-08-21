from datetime import datetime
from pydantic import BaseModel


class SpecificationBase(BaseModel):
    name: str


class SpecificationCreate(SpecificationBase):
    pass


class SpecificationOut(SpecificationBase):
    id: int
    file_name: str
    extraction_status: str
    error_message: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class SpecificationDetail(SpecificationOut):
    extracted_text: str | None


class RequirementOut(BaseModel):
    id: int
    req_number: str | None
    req_text: str
    urs_page: int | None = None
    classification: str | None
    spec_reference: str | None
    deviation_detail: str | None
    remarks: str | None
    analyzed_at: datetime | None

    class Config:
        from_attributes = True


class AnalysisSessionOut(BaseModel):
    id: int
    spec_id: int
    urs_name: str
    urs_file_name: str
    status: str
    error_message: str | None
    total_requirements: int
    analyzed_count: int
    created_at: datetime
    completed_at: datetime | None

    class Config:
        from_attributes = True


class AnalysisSessionDetail(AnalysisSessionOut):
    requirements: list[RequirementOut]
    specification: SpecificationOut
