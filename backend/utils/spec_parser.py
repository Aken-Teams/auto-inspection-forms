"""Parse spec strings from Excel into structured spec definitions."""
import re
from decimal import Decimal


def parse_spec_string(spec_str: str) -> dict:
    """Parse a spec string like '125~145', '≥3', '√', 'OK' into structured format.

    Returns dict with keys: spec_type, min_value, max_value, expected_text,
    threshold_value, threshold_operator
    """
    if spec_str is None:
        return {"spec_type": "skip"}

    spec_str = str(spec_str).strip()

    if spec_str in ("/", "-", "", "N/A"):
        return {"spec_type": "skip"}

    # Check mark
    if spec_str in ("√", "✓", "V", "v"):
        return {"spec_type": "check", "expected_text": "√"}

    # Range pattern: min~max or min～max
    range_match = re.match(r"^([\d.]+)\s*[~～]\s*([\d.]+)$", spec_str)
    if range_match:
        return {
            "spec_type": "range",
            "min_value": Decimal(range_match.group(1)),
            "max_value": Decimal(range_match.group(2)),
        }

    # Threshold: ≥N, >=N, ≤N, <=N, >N, <N
    threshold_match = re.match(r"^([≥≤><]=?|>=|<=)\s*([\d.]+)$", spec_str)
    if threshold_match:
        op = threshold_match.group(1)
        op_map = {"≥": ">=", "≤": "<=", ">": ">", "<": "<", ">=": ">=", "<=": "<="}
        return {
            "spec_type": "threshold",
            "threshold_operator": op_map.get(op, op),
            "threshold_value": Decimal(threshold_match.group(2)),
        }

    # Text match (OK, NG, etc.)
    if spec_str in ("OK", "NG"):
        return {"spec_type": "text", "expected_text": spec_str}

    # Fallback: try as text
    return {"spec_type": "text", "expected_text": spec_str}


def judge_value(raw_value, spec_type: str, min_value=None, max_value=None,
                expected_text=None, threshold_value=None, threshold_operator=None) -> str:
    """Judge a raw value against a spec. Returns 'OK', 'NG', or 'SKIP'."""
    if spec_type == "skip":
        return "SKIP"

    if raw_value is None or str(raw_value).strip() in ("", "/", "-"):
        return "SKIP"

    raw_str = str(raw_value).strip()

    if spec_type == "check":
        return "OK" if raw_str in ("√", "✓", "V", "v", "○") else "NG"

    if spec_type == "text":
        return "OK" if raw_str == expected_text else "NG"

    if spec_type == "range":
        try:
            val = float(raw_str)
            return "OK" if float(min_value) <= val <= float(max_value) else "NG"
        except (ValueError, TypeError):
            return "ERROR"

    if spec_type == "threshold":
        try:
            val = float(raw_str)
            tv = float(threshold_value)
            ops = {">=": val >= tv, "<=": val <= tv, ">": val > tv, "<": val < tv}
            return "OK" if ops.get(threshold_operator, False) else "NG"
        except (ValueError, TypeError):
            return "ERROR"

    return "SKIP"
