"""Identify which form type an Excel file belongs to."""
import re
import logging
from sqlalchemy.orm import Session
from models import FormType
from services.ai_service import identify_form_type_ai, is_ai_available

logger = logging.getLogger(__name__)

# Built-in form identification patterns
FORM_PATTERNS = {
    "F-QA1021": {
        "filename_keywords": ["离子消散", "QA1021"],
        "sheet_keywords": ["离子消散", "离子风扇"],
        "sheet_name_pattern": r"RD-LZ-",
    },
    "F-RD09AA": {
        "filename_keywords": ["机台检查", "RD09AA"],
        "sheet_keywords": ["成型机台检查", "成 型 机 台", "Auto Mold"],
        "sheet_name_pattern": r"^WP\w+-\d+$",
    },
    "F-RD09AB": {
        "filename_keywords": ["洗模检查", "RD09AB"],
        "sheet_keywords": ["洗模检查", "成型洗模", "洗模原因"],
        "sheet_name_pattern": r"^WP\w+-\d+$",
    },
    "F-RD09AJ": {
        "filename_keywords": ["焊接炉", "RD09AJ"],
        "sheet_keywords": ["焊接炉检查", "RO焊接炉"],
        "sheet_name_pattern": r"^WCBA-\d+$",
    },
    "F-RD09AK": {
        "filename_keywords": ["切弯脚", "RD09AK"],
        "sheet_keywords": ["切弯脚尺寸", "SMD(Clip"],
        "sheet_name_pattern": r"WTFB-",
    },
}

# Regex to extract form codes from filenames
# Matches patterns like: F-QA1021, F-RD09AA, F-RD09B10, F-RD2140, F-RD0976
_FORM_CODE_RE = re.compile(r"(F-[A-Z]{2}\d{2,4}[A-Z0-9]{0,3})(?=[_\-\s.\u4e00-\u9fff]|$)", re.IGNORECASE)


def identify_form_type(filename: str, sheet_names: list, sheet_contents: dict = None, db: Session = None) -> str | None:
    """Identify the form type from filename and sheet names.

    Priority:
      1. Extract exact form code from filename (most reliable)
      2. Built-in filename keyword matching
      3. Sheet name pattern matching (for built-in types only)
      4. Sheet content keyword matching
      5. Custom form type DB patterns
      6. AI identification (last resort)
    """
    # Step 1: Extract exact form code from filename using regex
    code_match = _FORM_CODE_RE.search(filename)
    if code_match:
        extracted_code = code_match.group(1).upper()
        # Check if it's a known built-in code
        if extracted_code in FORM_PATTERNS:
            return extracted_code
        # Check if it exists in DB as a custom type
        if db:
            existing = db.query(FormType).filter(FormType.form_code == extracted_code).first()
            if existing:
                return extracted_code

        # Check if any known code is a PREFIX of extracted code
        # e.g., regex captures "F-QA10212" but "F-QA1021" is a known code
        for known_code in FORM_PATTERNS:
            if extracted_code.startswith(known_code) and len(extracted_code) > len(known_code):
                logger.info(f"Corrected form code: {extracted_code} -> {known_code} (prefix match)")
                return known_code
        if db:
            prefix_matches = db.query(FormType.form_code).all()
            best_match = None
            for (code,) in prefix_matches:
                if extracted_code.startswith(code) and len(extracted_code) > len(code):
                    if best_match is None or len(code) > len(best_match):
                        best_match = code
            if best_match:
                logger.info(f"Corrected form code: {extracted_code} -> {best_match} (DB prefix match)")
                return best_match

        # New form code found in filename - return it (will be auto-created by upload flow)
        return extracted_code

    # Step 2: Built-in filename keyword matching (for files without form code in name)
    filename_matches = []
    for form_code, patterns in FORM_PATTERNS.items():
        for keyword in patterns["filename_keywords"]:
            if keyword.lower() in filename.lower():
                filename_matches.append(form_code)
                break

    if len(filename_matches) == 1:
        return filename_matches[0]

    # Step 3: Sheet name pattern matching (built-in types only)
    non_summary_sheets = [s for s in sheet_names if s != "汇总"]
    for form_code, patterns in FORM_PATTERNS.items():
        pattern = patterns["sheet_name_pattern"]
        for sheet in non_summary_sheets:
            if re.search(pattern, sheet):
                if form_code in ("F-RD09AA", "F-RD09AB") and sheet_contents:
                    return _disambiguate_mold(form_code, sheet_contents)
                return form_code

    # Step 4: Sheet content keyword matching
    if sheet_contents:
        all_text = " ".join(str(v) for v in sheet_contents.values())
        for form_code, patterns in FORM_PATTERNS.items():
            for keyword in patterns["sheet_keywords"]:
                if keyword in all_text:
                    return form_code

    # Step 5: Custom form type DB patterns
    if db:
        custom_types = db.query(FormType).filter(
            FormType.file_pattern.isnot(None),
            FormType.file_pattern != "",
        ).all()
        for ft in custom_types:
            try:
                if re.search(ft.file_pattern, filename, re.IGNORECASE):
                    return ft.form_code
            except re.error:
                if ft.file_pattern.lower() in filename.lower():
                    return ft.form_code

    # Step 6: AI identification (last resort)
    if is_ai_available() and sheet_contents:
        all_content = "\n".join(f"[{k}] {v}" for k, v in list(sheet_contents.items())[:2])
        ai_result = identify_form_type_ai(filename, sheet_names, all_content)
        if ai_result:
            return ai_result.get("form_code")

    return None


def _disambiguate_mold(candidate: str, sheet_contents: dict) -> str:
    """Disambiguate between F-RD09AA (机台检查) and F-RD09AB (洗模检查)."""
    all_text = " ".join(str(v) for v in sheet_contents.values())
    if "洗模" in all_text or "洗模原因" in all_text:
        return "F-RD09AB"
    if "成型机台" in all_text or "成 型 机 台" in all_text:
        return "F-RD09AA"
    return candidate


def get_form_type_from_db(db: Session, form_code: str) -> FormType | None:
    """Get FormType record from database."""
    return db.query(FormType).filter(FormType.form_code == form_code).first()


def extract_equipment_id_from_sheet(sheet_name: str, form_code: str) -> str | None:
    """Extract equipment/machine ID from sheet name.

    Returns None if no valid equipment ID pattern is found.

    Examples:
        'WCBA-0001' -> 'WCBA-0001'
        'RD-LZ-142026年04月' -> 'RD-LZ-14'
        'WTFB-0004RD_SMD切弯脚尺寸-班' -> 'WTFB-0004'
        'WPRN-0001' -> 'WPRN-0001'
        'Sheet1' -> None
    """
    if form_code == "F-QA1021":
        match = re.match(r"(RD-LZ-\d+?)(\d{4}年)", sheet_name)
        if not match:
            match = re.match(r"(RD-LZ-\d+)", sheet_name)
        return match.group(1) if match else None

    if form_code in ("F-RD09AA", "F-RD09AB"):
        match = re.match(r"(WP\w+-\d+)", sheet_name)
        return match.group(1) if match else None

    if form_code == "F-RD09AJ":
        match = re.match(r"(WCBA-\d+)", sheet_name)
        return match.group(1) if match else None

    if form_code == "F-RD09AK":
        match = re.match(r"(WTFB-\d+)", sheet_name)
        return match.group(1) if match else None

    # Generic fallback: common equipment ID patterns (e.g., ABCD-0001)
    generic_match = re.match(r"([A-Z]{2,6}(?:-[A-Z]*)?-\d+)", sheet_name, re.IGNORECASE)
    if generic_match:
        return generic_match.group(1)

    logger.warning(f"Could not extract equipment ID from sheet '{sheet_name}' for form '{form_code}'")
    return None
