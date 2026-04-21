"""Extract spec item definitions from data sheet headers when no 汇总 sheet exists.

Supports multiple structural archetypes found in AU inspection forms:
  Pattern A: Simple single-row header (e.g., RD09EA, RD2140)
  Pattern B: Two-tier header with sub-items (e.g., RD09AL, RD09AN)
  Pattern C: Multi-tier with zone numbers (e.g., RD09AA, RD09AJ)
  Pattern D: Headers include spec thresholds (e.g., RD09BU)
  Pattern E: Pivoted/horizontal matrix (e.g., RD1024)
  Pattern F: Multi-equipment per row (e.g., QA1021, RD09AY)
  Pattern G: Calendar/grid layout (e.g., RD09F1)
"""
import re
import logging
from utils.spec_parser import parse_spec_string

logger = logging.getLogger(__name__)

# Regex for extracting equipment IDs from cell content
_CELL_EQUIP_RE = re.compile(
    r"(?:机台[号编]?|烤箱编号|焊接炉编号|柜号|设备编号)[：:]\s*(\S+)"
)

# Regex for extracting equipment IDs from sheet names
_SHEET_EQUIP_RE = re.compile(
    r"^(W[A-Z]{2,4}-\d{4}|RD[-_][A-Z]{2,}[-_]\d{2,4})"
)

# Regex for embedded spec ranges in header text, e.g. "顶针高度（300-750）（um）"
_HEADER_SPEC_RE = re.compile(
    r"[（(]([\d.]+)\s*[-~～]\s*([\d.]+)[）)]"
)

# Regex for embedded threshold specs, e.g. "NG<0.035%", "≤0.07%"
_HEADER_THRESHOLD_RE = re.compile(
    r"[<>≤≥]\s*[\d.]+"
)

# Regex for spec metadata in calendar/grid layouts, e.g. "温度规格：20-26℃"
_SPEC_METADATA_RE = re.compile(
    r"(.{1,8})规格[：:]\s*(.+)"
)

# Regex for bare ranges (no parentheses), e.g. "20-26℃", "15%~45%"
_BARE_RANGE_RE = re.compile(
    r"([\d.]+)[%℃°]?\s*[-~～]\s*([\d.]+)"
)

# Labels that are metadata, not check items — should be skipped
_SKIP_LABELS = {
    "日期", "时间", "班别", "班次", "日期/班别", "日期班别", "时间/班别",
    "确认", "确认者", "领班确认", "备注", "判定", "判定结果",
    "检查者", "记录者", "签名", "测量者", "点检人员",
    "序号", "No", "NO", "no", "项目",
    "设备编号", "机台号", "机台编号", "机台", "机台工位",
    "成品料号", "工单号", "工单", "分批号", "批号", "晶粒批号", "分批批次",
    "产品种类", "模具号", "模数",
    "异常记处理录", "异常处理",
    "不良数", "不良率", "抽样数",
    "检验者", "签核", "记录人",
    "站别", "柜号",
    "品名", "产品名称", "不良项目",
    "不良数(PCS)", "不良数（PCS）", "不良率(%)", "不良率（%）",
    "不良品数", "不良品率",
}

# Partial matches — if label contains any of these, skip it
_SKIP_PARTIALS = [
    "签名", "备注", "判定", "确认", "日期", "时间", "班别",
    "不良数", "不良率", "抽样",
]


def extract_specs_from_headers(wb, form_code: str, form_name: str = "") -> list[dict] | None:
    """Extract spec definitions from data sheet headers.

    Scans the first data sheet (non-汇总) to identify header rows and
    produce a UNIVERSAL spec group containing all check items found.

    Returns list of equipment spec dicts in the same format as
    _preview_builtin / _preview_ai, or None if no usable headers found.
    """
    data_sheets = [s for s in wb.sheetnames if s != "汇总"]
    if not data_sheets:
        return None

    # Use the first data sheet as the template
    ws = wb[data_sheets[0]]
    if (ws.max_row or 0) < 2 or (ws.max_column or 0) < 2:
        return None

    # Try column-header extraction first
    header_rows, header_start = _find_header_rows(ws)
    items = None
    if header_rows:
        items = _build_items_from_headers(header_rows, ws, header_start)

    # Fallback: try row-label extraction (transposed/calendar layouts)
    if not items:
        items = _try_row_label_extraction(ws)

    if not items:
        return None

    logger.info(
        f"Extracted {len(items)} check items from headers of "
        f"'{data_sheets[0]}' for {form_code}"
    )

    return [{
        "equipment_id": "UNIVERSAL",
        "equipment_name": f"{form_name or form_code} 通用规格",
        "items": items,
    }]


def _find_header_rows(ws, max_scan: int = 15, min_cols: int = 3):
    """Find header row(s) in a data sheet.

    Returns:
        (header_rows, header_start_row)
        Each header_row is a list of (col_index, label_text) tuples.
    """
    row_data = []
    for row in range(1, min(max_scan + 1, (ws.max_row or 1) + 1)):
        cells = []
        for col in range(1, min(50, (ws.max_column or 1) + 1)):
            val = ws.cell(row=row, column=col).value
            if val is not None:
                text = str(val).replace("\n", " ").strip()
                if text:
                    cells.append((col, text))
        row_data.append((row, cells))

    if not row_data:
        return [], 0

    # Find the first row with >= min_cols non-empty cells
    # that looks like a header (contains Chinese text or has many columns)
    header_start = 0
    header_rows = []

    for row_num, cells in row_data:
        if len(cells) < min_cols:
            continue

        # Check if this looks like a header row (not just a title/logo row)
        has_chinese = any(
            re.search(r"[\u4e00-\u9fff]", text)
            for _, text in cells
        )
        # Title rows usually have few cells; header rows have many
        if has_chinese or len(cells) >= 5:
            # Extra check: skip rows that look like title/company rows
            # (single merged cell spanning many columns, or contains 公司/记录表)
            texts = [t for _, t in cells]
            joined = " ".join(texts)
            if ("有限公司" in joined or "记录表" in joined) and len(cells) <= 4:
                continue

            header_start = row_num
            header_rows.append(cells)

            # Check following rows for sub-headers (Pattern B/C/D)
            for next_row_num, next_cells in row_data:
                if next_row_num <= row_num:
                    continue
                if next_row_num > row_num + 2:
                    break
                if len(next_cells) < 2:
                    continue

                # Is this a sub-header? Check if it's NOT a data row
                # Data rows typically start with dates (03/17, 3/17, etc.)
                first_text = next_cells[0][1] if next_cells else ""
                if re.match(r"^\d{1,2}[/\-]", first_text):
                    break  # This is data, stop looking for sub-headers

                # All-numeric rows are zone/measurement indices (Pattern C)
                all_numeric = all(
                    re.match(r"^[\d.]+$", t) for _, t in next_cells
                )
                if all_numeric and len(next_cells) >= 2:
                    header_rows.append(next_cells)
                    continue

                # Chinese text in sub-header
                has_chinese_sub = any(
                    re.search(r"[\u4e00-\u9fff]", t)
                    for _, t in next_cells
                )
                if has_chinese_sub:
                    header_rows.append(next_cells)
                    continue

                # English labels (e.g., "1st", "2nd", "DA1", "CB")
                has_alpha = any(
                    re.search(r"[a-zA-Z]", t)
                    for _, t in next_cells
                )
                if has_alpha and len(next_cells) >= 2:
                    header_rows.append(next_cells)
                    continue

            break

    return header_rows, header_start


def _build_items_from_headers(header_rows, ws, header_start):
    """Build spec items from header row(s)."""
    items = []
    order = 0

    if len(header_rows) == 1:
        # Pattern A: Simple single-row header
        for col, label in header_rows[0]:
            if _is_skip_label(label):
                continue
            item_name = _clean_label(label)
            if not item_name:
                continue
            spec_value, parsed = _extract_embedded_spec(label)
            items.append({
                "item_name": item_name,
                "spec_value": spec_value,
                "parsed_spec": parsed,
                "group_name": None,
                "sub_group": None,
                "display_order": order,
            })
            order += 1

    elif len(header_rows) >= 2:
        # Pattern B/C/D: Multi-tier header
        main_row = header_rows[0]
        sub_row = header_rows[1]

        # Build column spans for the main header
        main_spans = _compute_col_spans(main_row)

        # Check if sub_row is all-numeric (Pattern C: zone indices)
        all_numeric_sub = all(
            re.match(r"^[\d.]+$", t) for _, t in sub_row
        )

        if all_numeric_sub:
            # Pattern C: Main header labels + numeric indices
            # Each main header covers multiple numbered sub-columns
            for start, end, group_label in main_spans:
                if _is_skip_label(group_label):
                    continue
                group_name = _clean_label(group_label)
                # Find numeric sub-columns under this span
                for col, num_text in sub_row:
                    if start <= col <= end:
                        item_name = f"{group_name}-{num_text}"
                        spec_value, parsed = _extract_embedded_spec(group_label)
                        items.append({
                            "item_name": item_name,
                            "spec_value": spec_value,
                            "parsed_spec": parsed,
                            "group_name": group_name,
                            "sub_group": num_text,
                            "display_order": order,
                        })
                        order += 1
        else:
            # Pattern B/D: Main header labels + text sub-labels
            for col, sub_label in sub_row:
                if _is_skip_label(sub_label):
                    continue
                # Find which main header this column falls under
                group = _find_parent_label(col, main_spans)
                if group and _is_skip_label(group):
                    continue

                # Use sub_label as the item name, group as group_name
                item_name = _clean_label(sub_label)
                if not item_name:
                    continue

                group_name = _clean_label(group) if group else None

                spec_value, parsed = _extract_embedded_spec(
                    f"{group or ''} {sub_label}"
                )
                items.append({
                    "item_name": item_name,
                    "spec_value": spec_value,
                    "parsed_spec": parsed,
                    "group_name": group_name,
                    "sub_group": None,
                    "display_order": order,
                })
                order += 1

            # Also add main header columns that have NO sub-columns
            sub_cols = {col for col, _ in sub_row}
            for start, end, main_label in main_spans:
                if _is_skip_label(main_label):
                    continue
                # Check if any sub-column falls under this span
                has_sub = any(start <= c <= end for c in sub_cols)
                if not has_sub:
                    item_name = _clean_label(main_label)
                    if not item_name:
                        continue
                    spec_value, parsed = _extract_embedded_spec(main_label)
                    items.append({
                        "item_name": item_name,
                        "spec_value": spec_value,
                        "parsed_spec": parsed,
                        "group_name": None,
                        "sub_group": None,
                        "display_order": order,
                    })
                    order += 1

    return items


def _try_row_label_extraction(ws):
    """Fallback: extract items from row labels (transposed/calendar layouts).

    Pattern G: Calendar/grid — spec defined via "XXX规格：value" metadata cells
    Pattern E: Pivoted matrix — items as vertical row labels with embedded thresholds
    """
    items = []
    order = 0
    max_row = ws.max_row or 1
    max_col = ws.max_column or 1

    # --- Strategy 1: Pattern G (Calendar/Grid) ---
    # Look for "XXX规格：value" in first 8 rows (e.g., "温度规格：20-26℃")
    spec_metadata = {}
    for row in range(1, min(8, max_row + 1)):
        for col in range(1, min(30, max_col + 1)):
            val = ws.cell(row=row, column=col).value
            if not val:
                continue
            text = str(val).strip()
            m = _SPEC_METADATA_RE.match(text)
            if m:
                item_name = m.group(1).strip()
                spec_text = m.group(2).strip()
                range_m = _BARE_RANGE_RE.search(spec_text)
                if range_m:
                    spec_str = f"{range_m.group(1)}~{range_m.group(2)}"
                    parsed = parse_spec_string(spec_str)
                    spec_metadata[item_name] = (spec_str, parsed)
                else:
                    sv, parsed = _extract_embedded_spec(spec_text)
                    spec_metadata[item_name] = (sv, parsed)

    if spec_metadata:
        for item_name, (spec_value, parsed) in spec_metadata.items():
            items.append({
                "item_name": item_name,
                "spec_value": spec_value,
                "parsed_spec": parsed,
                "group_name": None,
                "sub_group": None,
                "display_order": order,
            })
            order += 1
        return items

    # --- Strategy 2: Pattern E (Pivoted Matrix) ---
    # Scan columns C and B for vertical blocks of Chinese item labels
    for label_col in [3, 2]:
        candidate_items = []
        for row in range(5, min(35, max_row + 1)):
            val = ws.cell(row=row, column=label_col).value
            if not val:
                continue
            text = str(val).replace("\n", " ").strip()
            if not text or len(text) <= 1:
                continue
            if _is_skip_label(text):
                continue
            if not re.search(r"[\u4e00-\u9fff]", text):
                continue
            candidate_items.append((row, text))

        if len(candidate_items) >= 2:
            for _, label in candidate_items:
                item_name = _clean_label(label)
                spec_value, parsed = _extract_embedded_spec(label)
                items.append({
                    "item_name": item_name,
                    "spec_value": spec_value,
                    "parsed_spec": parsed,
                    "group_name": None,
                    "sub_group": None,
                    "display_order": order,
                })
                order += 1
            return items

    return items


def _is_skip_label(label: str) -> bool:
    """Check if a header label should be skipped (metadata, not a check item)."""
    label_clean = label.replace("\n", " ").strip()
    if not label_clean or len(label_clean) <= 1:
        return True
    # Exact match
    if label_clean in _SKIP_LABELS:
        return True
    # Partial match
    for partial in _SKIP_PARTIALS:
        if partial in label_clean and len(label_clean) <= len(partial) + 4:
            return True
    # Pure numbers
    if re.match(r"^[\d.]+$", label_clean):
        return True
    # Date/time patterns (e.g., "2026/03", "03/17", "07:04", "2026年3月")
    if re.match(r"^\d{2,4}[/\-年]\d{1,2}[月]?$", label_clean):
        return True
    if re.match(r"^\d{1,2}:\d{2}$", label_clean):
        return True
    # Labels starting with 柜号/站别/年份 metadata
    if re.match(r"^(柜号|站别|编号)[：:]", label_clean):
        return True
    # Spec metadata strings (e.g., "温度规格：20-26℃", "湿度规格：35-65%")
    if re.match(r"^.{0,4}规格[：:]", label_clean):
        return True
    return False


def _clean_label(label: str) -> str:
    """Clean a header label for use as item name."""
    text = label.replace("\n", " ").strip()
    # Remove excessive whitespace
    text = re.sub(r"\s+", " ", text)
    # Truncate very long labels
    if len(text) > 60:
        text = text[:60]
    return text


def _extract_embedded_spec(label: str) -> tuple[str, dict]:
    """Extract embedded spec range from a header label.

    E.g., "顶针高度（300-750）（um）" -> spec_value="300~750", parsed=range spec
    """
    # Try range pattern: (300-750), (5~35)
    match = _HEADER_SPEC_RE.search(label)
    if match:
        min_val = match.group(1)
        max_val = match.group(2)
        spec_str = f"{min_val}~{max_val}"
        return spec_str, parse_spec_string(spec_str)

    # Try threshold pattern: ≥3, <=100, >5, NG<0.035%
    threshold_match = _HEADER_THRESHOLD_RE.search(label)
    if threshold_match:
        spec_str = threshold_match.group(0).replace("≥", ">=").replace("≤", "<=")
        return spec_str, parse_spec_string(spec_str)

    # Check if label contains "是否" (yes/no question) → check type
    if "是否" in label:
        return "√", parse_spec_string("√")

    # No embedded spec found
    return "", {"spec_type": "skip"}


def _compute_col_spans(row: list[tuple[int, str]]) -> list[tuple[int, int, str]]:
    """Compute column spans for a header row.

    Returns list of (start_col, end_col, label).
    """
    if not row:
        return []
    spans = []
    for i, (col, label) in enumerate(row):
        next_col = row[i + 1][0] if i + 1 < len(row) else col + 10
        spans.append((col, next_col - 1, label))
    return spans


def _find_parent_label(col: int, spans: list[tuple[int, int, str]]) -> str | None:
    """Find the parent header label for a given column."""
    for start, end, label in spans:
        if start <= col <= end:
            return label
    return None


def extract_equipment_from_sheet(ws, sheet_name: str) -> str | None:
    """Try to extract equipment ID from sheet name or cell content."""
    # Try sheet name first
    match = _SHEET_EQUIP_RE.match(sheet_name)
    if match:
        return match.group(1)

    # Try cell content (first 10 rows, first 10 cols)
    for row in range(1, min(11, (ws.max_row or 1) + 1)):
        for col in range(1, min(11, (ws.max_column or 1) + 1)):
            val = ws.cell(row=row, column=col).value
            if val:
                cell_match = _CELL_EQUIP_RE.search(str(val))
                if cell_match:
                    return cell_match.group(1)
    return None
