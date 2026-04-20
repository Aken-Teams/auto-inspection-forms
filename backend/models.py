from sqlalchemy import Column, Integer, String, Text, JSON, Boolean, DECIMAL, Enum, TIMESTAMP, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base


class FormType(Base):
    __tablename__ = "form_types"

    id = Column(Integer, primary_key=True, autoincrement=True)
    form_code = Column(String(50), nullable=False, unique=True)
    form_name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    identifier_keywords = Column(JSON, nullable=True)
    file_pattern = Column(String(500), nullable=True)
    is_builtin = Column(Boolean, default=False)
    structural_fingerprint = Column(JSON, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    specs = relationship("FormSpec", back_populates="form_type", cascade="all, delete-orphan")


class FormSpec(Base):
    __tablename__ = "form_specs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    form_type_id = Column(Integer, ForeignKey("form_types.id"), nullable=False)
    equipment_id = Column(String(100), nullable=False)
    equipment_name = Column(String(200), nullable=True)
    extra_info = Column(JSON, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    form_type = relationship("FormType", back_populates="specs")
    items = relationship("SpecItem", back_populates="form_spec", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("form_type_id", "equipment_id", name="uk_form_equipment"),
    )


class SpecItem(Base):
    __tablename__ = "spec_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    form_spec_id = Column(Integer, ForeignKey("form_specs.id", ondelete="CASCADE"), nullable=False)
    item_name = Column(String(200), nullable=False)
    spec_type = Column(Enum("range", "check", "text", "threshold", "skip"), nullable=False)
    min_value = Column(DECIMAL(15, 6), nullable=True)
    max_value = Column(DECIMAL(15, 6), nullable=True)
    expected_text = Column(String(200), nullable=True)
    threshold_value = Column(DECIMAL(15, 6), nullable=True)
    threshold_operator = Column(String(10), nullable=True)
    display_order = Column(Integer, default=0)
    group_name = Column(String(100), nullable=True)
    sub_group = Column(String(100), nullable=True)

    form_spec = relationship("FormSpec", back_populates="items")


class UploadRecord(Base):
    __tablename__ = "upload_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(String(36), nullable=True, index=True)
    original_filename = Column(String(500), nullable=False)
    stored_filename = Column(String(500), nullable=False)
    form_type_id = Column(Integer, ForeignKey("form_types.id"), nullable=True)
    upload_time = Column(TIMESTAMP, server_default=func.now())
    status = Column(Enum("pending", "processing", "completed", "error"), default="pending")
    total_sheets = Column(Integer, default=0)
    processed_sheets = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)

    form_type = relationship("FormType")
    results = relationship("InspectionResult", back_populates="upload", cascade="all, delete-orphan")


class InspectionResult(Base):
    __tablename__ = "inspection_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    upload_id = Column(Integer, ForeignKey("upload_records.id", ondelete="CASCADE"), nullable=False)
    sheet_name = Column(String(200), nullable=False)
    equipment_id = Column(String(100), nullable=True)
    form_spec_id = Column(Integer, ForeignKey("form_specs.id"), nullable=True)
    has_spec = Column(Boolean, default=False)
    overall_result = Column(Enum("OK", "NG", "NO_SPEC", "ERROR"), default="NO_SPEC")
    raw_data = Column(JSON, nullable=True)
    judged_data = Column(JSON, nullable=True)
    inspection_date = Column(String(50), nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())

    upload = relationship("UploadRecord", back_populates="results")
    form_spec = relationship("FormSpec")


class SpecVersion(Base):
    __tablename__ = "spec_versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    form_spec_id = Column(Integer, ForeignKey("form_specs.id", ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer, nullable=False)
    source = Column(String(50), nullable=False)
    source_filename = Column(String(500), nullable=True)
    stored_filepath = Column(String(500), nullable=True)
    file_hash = Column(String(64), nullable=True)
    items_snapshot = Column(JSON, nullable=False)
    item_count = Column(Integer, default=0)
    change_summary = Column(JSON, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())

    form_spec = relationship("FormSpec", backref="versions")
