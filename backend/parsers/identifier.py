"""Identify which form type an Excel file belongs to."""
import re
from sqlalchemy.orm import Session
from models import FormType

# Form identification patterns
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


def identify_form_type(filename: str, sheet_names: list, sheet_contents: dict = None) -> str | None:
    """Identify the form type from filename and sheet names.

    Args:
        filename: Original filename
        sheet_names: List of sheet names in the workbook
        sheet_contents: Optional dict of {sheet_name: first_few_rows_text} for content verification

    Returns:
        Form code string (e.g., 'F-QA1021') or None
    """
    # Step 1: Match by filename
    filename_matches = []
    for form_code, patterns in FORM_PATTERNS.items():
        for keyword in patterns["filename_keywords"]:
            if keyword.lower() in filename.lower():
                filename_matches.append(form_code)
                break

    if len(filename_matches) == 1:
        return filename_matches[0]

    # Step 2: If multiple matches or no match, try sheet names
    non_summary_sheets = [s for s in sheet_names if s != "汇总"]

    for form_code, patterns in FORM_PATTERNS.items():
        pattern = patterns["sheet_name_pattern"]
        for sheet in non_summary_sheets:
            if re.search(pattern, sheet):
                # For AA vs AB disambiguation, check content
                if form_code in ("F-RD09AA", "F-RD09AB") and sheet_contents:
                    return _disambiguate_mold(form_code, sheet_contents)
                return form_code

    # Step 3: Check sheet content if available
    if sheet_contents:
        all_text = " ".join(str(v) for v in sheet_contents.values())
        for form_code, patterns in FORM_PATTERNS.items():
            for keyword in patterns["sheet_keywords"]:
                if keyword in all_text:
                    return form_code

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


def extract_equipment_id_from_sheet(sheet_name: str, form_code: str) -> str:
    """Extract equipment/machine ID from sheet name.

    Examples:
        'WCBA-0001' -> 'WCBA-0001'
        'RD-LZ-142026年04月' -> 'RD-LZ-14'
        'WTFB-0004RD_SMD切弯脚尺寸-班' -> 'WTFB-0004'
        'WPRN-0001' -> 'WPRN-0001'
    """
    if form_code == "F-QA1021":
        # Extract RD-LZ-XX from 'RD-LZ-142026年04月'
        match = re.match(r"(RD-LZ-\d+)", sheet_name)
        return match.group(1) if match else sheet_name

    if form_code in ("F-RD09AA", "F-RD09AB"):
        match = re.match(r"(WP\w+-\d+)", sheet_name)
        return match.group(1) if match else sheet_name

    if form_code == "F-RD09AJ":
        match = re.match(r"(WCBA-\d+)", sheet_name)
        return match.group(1) if match else sheet_name

    if form_code == "F-RD09AK":
        match = re.match(r"(WTFB-\d+)", sheet_name)
        return match.group(1) if match else sheet_name

    return sheet_name
