"""Service for permanent storage and deduplication of spec Excel files."""
import hashlib
import os
import logging

from sqlalchemy.orm import Session
from models import SpecVersion, FormSpec
from config import SPEC_DIR

logger = logging.getLogger(__name__)


def compute_file_hash(content: bytes) -> str:
    """Compute SHA-256 hash of file content."""
    return hashlib.sha256(content).hexdigest()


def store_spec_file(content: bytes, form_code: str, original_filename: str) -> dict:
    """Permanently store a spec file in SPEC_DIR/{form_code}/.

    Returns:
        {"stored_path": relative path, "file_hash": sha256, "original_filename": str}
    """
    file_hash = compute_file_hash(content)
    dir_path = os.path.join(SPEC_DIR, form_code)
    os.makedirs(dir_path, exist_ok=True)

    # Use hash prefix + original filename to avoid collisions
    safe_name = original_filename.replace("/", "_").replace("\\", "_")
    stored_name = f"{file_hash[:12]}_{safe_name}"
    stored_path = os.path.join(form_code, stored_name)
    abs_path = os.path.join(SPEC_DIR, stored_path)

    # Don't overwrite if same hash file already exists
    if not os.path.exists(abs_path):
        with open(abs_path, "wb") as f:
            f.write(content)
        logger.info(f"Stored spec file: {stored_path}")
    else:
        logger.info(f"Spec file already exists: {stored_path}")

    return {
        "stored_path": stored_path,
        "file_hash": file_hash,
        "original_filename": original_filename,
    }


def find_duplicate(db: Session, form_code: str, file_hash: str) -> dict | None:
    """Check if a file with the same hash has been imported before for this form type.

    Returns version info if duplicate found, None otherwise.
    """
    # Find any SpecVersion with this hash that belongs to this form_code's specs
    version = (
        db.query(SpecVersion)
        .join(FormSpec, SpecVersion.form_spec_id == FormSpec.id)
        .join(FormSpec.form_type)
        .filter(SpecVersion.file_hash == file_hash)
        .order_by(SpecVersion.created_at.desc())
        .first()
    )
    if version:
        return {
            "version_id": version.id,
            "version_number": version.version_number,
            "source_filename": version.source_filename,
            "equipment_id": version.form_spec.equipment_id,
            "created_at": str(version.created_at),
        }
    return None


def find_duplicate_across_all(file_hash: str) -> dict | None:
    """Check if a file with the same hash exists in ANY form type's spec_files folder.

    Scans the filesystem rather than DB, so it catches files even if DB records were deleted.
    Returns {"form_code": str, "filename": str} if found, None otherwise.
    """
    hash_prefix = file_hash[:12]
    if not os.path.isdir(SPEC_DIR):
        return None

    for form_code_dir in os.listdir(SPEC_DIR):
        dir_path = os.path.join(SPEC_DIR, form_code_dir)
        if not os.path.isdir(dir_path):
            continue
        for filename in os.listdir(dir_path):
            if filename.startswith(hash_prefix):
                # Extract original filename (remove hash prefix)
                original = filename[len(hash_prefix) + 1:] if len(filename) > len(hash_prefix) + 1 else filename
                return {
                    "form_code": form_code_dir,
                    "filename": original,
                    "file_hash": file_hash,
                }
    return None


def check_specs_identical(db: Session, form_code: str, parsed_specs: list[dict]) -> bool:
    """Check if parsed specs from a file are identical to existing DB specs.

    Catches the case where the same spec content appears in a different file
    (e.g., user copies file, modifies metadata, but spec content is unchanged).
    """
    from models import FormType, SpecItem
    from services.spec_version_service import compute_diff

    form_type = db.query(FormType).filter(FormType.form_code == form_code).first()
    if not form_type or not parsed_specs:
        return False

    for eq_spec in parsed_specs:
        eq_id = eq_spec.get("equipment_id")
        existing = db.query(FormSpec).filter(
            FormSpec.form_type_id == form_type.id,
            FormSpec.equipment_id == eq_id,
        ).first()

        if not existing:
            return False  # New equipment = not identical

        existing_items = db.query(SpecItem).filter(
            SpecItem.form_spec_id == existing.id
        ).order_by(SpecItem.display_order).all()

        old_items = [
            {
                "item_name": item.item_name,
                "spec_type": item.spec_type,
                "min_value": float(item.min_value) if item.min_value is not None else None,
                "max_value": float(item.max_value) if item.max_value is not None else None,
                "expected_text": item.expected_text,
                "threshold_value": float(item.threshold_value) if item.threshold_value is not None else None,
                "threshold_operator": item.threshold_operator,
                "group_name": item.group_name,
                "sub_group": item.sub_group,
            }
            for item in existing_items
        ]

        new_items = []
        for item in eq_spec.get("items", []):
            parsed = item.get("parsed_spec", {})
            new_items.append({
                "item_name": item.get("item_name", ""),
                "spec_type": parsed.get("spec_type", "text"),
                "min_value": parsed.get("min_value"),
                "max_value": parsed.get("max_value"),
                "expected_text": parsed.get("expected_text"),
                "threshold_value": parsed.get("threshold_value"),
                "threshold_operator": parsed.get("threshold_operator"),
                "group_name": item.get("group_name"),
                "sub_group": item.get("sub_group"),
            })

        diff = compute_diff(old_items, new_items)
        summary = diff["summary"]
        if summary["added"] > 0 or summary["removed"] > 0 or summary["modified"] > 0:
            return False  # Has changes = not identical

    return True


def get_absolute_path(stored_path: str) -> str:
    """Get absolute filesystem path for a stored spec file."""
    return os.path.join(SPEC_DIR, stored_path)
