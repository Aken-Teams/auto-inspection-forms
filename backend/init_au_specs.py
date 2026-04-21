"""Batch register all AU form types and import header-based specs.

Usage:
    cd backend
    python init_au_specs.py
"""
import os
import sys
import hashlib
import re
import logging

sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal, engine, Base
from models import FormType, FormSpec, SpecItem
from services.spec_service import import_specs_from_excel
from config import SPEC_DIR

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

AU_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "AU未建立规格点检表", "AU")

# Built-in form codes that already have dedicated parsers
BUILTIN_CODES = {"F-QA1021", "F-RD09AA", "F-RD09AB", "F-RD09AJ", "F-RD09AK"}

# Extract form code from filename using regex
_FORM_CODE_RE = re.compile(r"(F-(?:QA|RD)\d{2,4}[A-Z]*\d*)")


def extract_form_code(filename: str) -> str | None:
    """Extract form code from filename."""
    match = _FORM_CODE_RE.search(filename)
    return match.group(1).upper() if match else None


def extract_form_name(filename: str, form_code: str) -> str:
    """Extract human-readable form name from filename."""
    # Remove extension
    name = os.path.splitext(filename)[0]
    # Remove the form code prefix and common separators
    name = re.sub(rf"^{re.escape(form_code)}[-_\s]*", "", name)
    # Clean up
    name = name.strip("-_ ")
    return name or form_code


def main():
    if not os.path.isdir(AU_DIR):
        logger.error(f"AU directory not found: {AU_DIR}")
        sys.exit(1)

    db = SessionLocal()
    try:
        files = sorted([
            f for f in os.listdir(AU_DIR)
            if f.endswith(".xlsx") and not f.startswith("~")
        ])

        logger.info(f"Found {len(files)} AU files in {AU_DIR}\n")

        # Group files by form code (F-RD09F1 has two files)
        code_to_files: dict[str, list[str]] = {}
        for fname in files:
            code = extract_form_code(fname)
            if not code:
                logger.warning(f"  [SKIP] Cannot extract form code: {fname}")
                continue
            code_to_files.setdefault(code, []).append(fname)

        registered = 0
        skipped_builtin = 0

        for form_code, file_list in sorted(code_to_files.items()):
            # Skip built-in types (they already have dedicated parsers)
            if form_code in BUILTIN_CODES:
                logger.info(f"  [BUILTIN] {form_code} - skipped (has dedicated parser)")
                skipped_builtin += 1
                # But still store the file
                for fname in file_list:
                    _store_file(form_code, fname)
                continue

            # Use first file for form name
            form_name = extract_form_name(file_list[0], form_code)

            # Check if form type already exists
            existing = db.query(FormType).filter(
                FormType.form_code == form_code
            ).first()
            if existing:
                logger.info(f"  [EXISTS] {form_code}: {existing.form_name}")
            else:
                ft = FormType(
                    form_code=form_code,
                    form_name=form_name,
                    file_pattern=re.escape(form_code),
                    is_builtin=False,
                )
                db.add(ft)
                db.flush()
                logger.info(f"  [CREATED] {form_code}: {form_name}")
                registered += 1

            # Store files and import specs
            for fname in file_list:
                file_hash, stored_rel = _store_file(form_code, fname)

                filepath = os.path.join(AU_DIR, fname)
                result = import_specs_from_excel(
                    db, filepath, form_code,
                    source_filename=fname,
                    stored_filepath=stored_rel,
                    file_hash=file_hash,
                )
                if result.get("success"):
                    method = result.get("parse_method", "?")
                    specs = result.get("specs_created", 0)
                    items = result.get("items_created", 0)
                    logger.info(
                        f"           {fname}\n"
                        f"           -> {specs} spec(s), {items} item(s) [{method}]"
                    )
                elif result.get("error"):
                    logger.warning(
                        f"           {fname}\n"
                        f"           -> Error: {result['error']}"
                    )

        db.commit()
        logger.info(
            f"\nDone! Registered {registered} new form types "
            f"({skipped_builtin} built-in skipped)"
        )

        # Summary
        total_types = db.query(FormType).count()
        total_specs = db.query(FormSpec).count()
        total_items = db.query(SpecItem).count()
        logger.info(
            f"DB totals: {total_types} form types, "
            f"{total_specs} specs, {total_items} items"
        )

    finally:
        db.close()


def _store_file(form_code: str, filename: str) -> tuple[str, str]:
    """Store a file in spec_files/ and return (file_hash, relative_stored_path)."""
    filepath = os.path.join(AU_DIR, filename)
    with open(filepath, "rb") as f:
        content = f.read()

    file_hash = hashlib.sha256(content).hexdigest()[:12]
    spec_dir = os.path.join(SPEC_DIR, form_code)
    os.makedirs(spec_dir, exist_ok=True)

    safe_name = filename.replace("/", "_").replace("\\", "_")
    stored_name = f"{file_hash}_{safe_name}"
    stored_path = os.path.join(spec_dir, stored_name)
    stored_rel = os.path.join(form_code, stored_name)

    if not os.path.exists(stored_path):
        with open(stored_path, "wb") as sf:
            sf.write(content)

    return file_hash, stored_rel


if __name__ == "__main__":
    main()
