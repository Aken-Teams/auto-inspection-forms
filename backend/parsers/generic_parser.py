"""Generic parser for unrecognized Excel inspection forms."""
import re
from parsers.base import BaseParser

# Labels that indicate a judgment/result column
_JUDGMENT_LABELS = {"判定", "判定结果", "判定結果", "结果", "結果", "合否", "判断", "判斷"}

# Labels that are metadata (skip for sub-header detection)
_SKIP_LABELS = {
    "日期", "时间", "班别", "班次", "日期/班别", "时间/班别",
    "备注", "签名", "签核", "记录人", "检验者", "操作者",
    "序号", "No", "NO",
}

# Row labels that are metadata in pivot layouts
_PIVOT_SKIP_LABELS = {
    "日期", "时间", "班别", "班次", "签名", "签核", "记录人",
    "异常记处理录", "异常处理", "异常处理记录", "备注",
    "品名", "产品名称", "晶粒批号", "不良项目",
}

# Date patterns that indicate a pivot header (dates across columns)
_DATE_PATTERN = re.compile(
    r"^\d{1,2}\s*[DN]$"       # "17 D", "17 N"
    r"|^\d{1,2}[/\-]\d{1,2}$"  # "03/20"
)


class GenericParser(BaseParser):
    form_code = "GENERIC"

    def _parse_impl(self, ws, sheet_name):
        """Generic parser that reads all non-empty cells.

        Supports:
        - Multi-level headers (sub-labels under parent headers)
        - Pivot/transposed layouts (dates across columns, values in rows)
        """
        # Try pivot detection first
        pivot_result = self._try_pivot_parse(ws, sheet_name)
        if pivot_result:
            return pivot_result

        return self._parse_standard(ws, sheet_name)

    def _try_pivot_parse(self, ws, sheet_name):
        """Detect and parse pivot/transposed layouts.

        Pivot layouts have:
        - Row labels in column A/B (日期, 温度, 湿度, etc.)
        - Date/time values across columns as "headers"
        - Very few data rows but many columns
        """
        max_row = ws.max_row or 1
        max_col = ws.max_column or 1

        if max_row > 30 or max_col < 5:
            return None  # Not a pivot layout

        # Scan for a "date row" — a row where most values look like dates
        date_row = None
        label_col = None
        for row in range(1, min(15, max_row + 1)):
            # Check if col B has a label like "日期"
            val_b = self._cell_val(ws, row, 2)
            if val_b and str(val_b).strip() in ("日期", "日期/班别"):
                # Count how many columns from col 3 onwards have date-like values
                date_count = 0
                non_empty = 0
                for col in range(3, min(max_col + 1, 200)):
                    v = self._cell_val(ws, row, col)
                    if v:
                        non_empty += 1
                        if _DATE_PATTERN.match(str(v).strip()):
                            date_count += 1
                if date_count >= 3 and date_count >= non_empty * 0.5:
                    date_row = row
                    label_col = 2
                    break

        if not date_row:
            return None

        # Found a pivot layout — collect date columns
        date_cols = []
        for col in range(3, min(max_col + 1, 200)):
            v = self._cell_val(ws, date_row, col)
            if v:
                date_cols.append((col, str(v).strip()))

        if not date_cols:
            return None

        # Find measurement rows (rows below date_row that have numeric data)
        # These are the actual check items (温度, 湿度, etc.)
        item_rows = []
        for row in range(date_row + 1, min(max_row + 1, date_row + 10)):
            label = self._cell_val(ws, row, label_col)
            if not label:
                continue
            label_str = str(label).replace("\n", " ").strip()
            if label_str in _PIVOT_SKIP_LABELS:
                continue
            # Check if this row has numeric data in the date columns
            has_numeric = False
            for col, _ in date_cols:
                v = self._cell_val(ws, row, col)
                if v is not None:
                    try:
                        float(str(v))
                        has_numeric = True
                        break
                    except (ValueError, TypeError):
                        pass
            if has_numeric:
                item_rows.append((row, label_str))

        if not item_rows:
            return None

        # Build headers: one header per measurement item
        headers = []
        for _, item_label in item_rows:
            key = re.sub(r"[%℃°\s]", "", item_label) or item_label
            headers.append({"key": key, "label": item_label, "group": "data"})

        # Build rows: one row per date column (transpose)
        rows = []
        meta_rows = []
        for col, date_label in date_cols:
            values = {}
            cells = {}
            has_data = False
            for item_row, item_label in item_rows:
                key = re.sub(r"[%℃°\s]", "", item_label) or item_label
                v = self._cell_val(ws, item_row, col)
                if v is not None:
                    has_data = True
                values[key] = v
                cells[key] = [item_row, col]

            if has_data:
                rows.append({
                    "date": date_label,
                    "time": "",
                    "values": values,
                    "extra": {},
                })
                # For row_map, use the first item's row as the "record row"
                # since all items share the same column
                first_item_row = item_rows[0][0] if item_rows else date_row + 1
                meta_rows.append({"row": first_item_row, "cells": cells})

        return {
            "equipment_id": sheet_name,
            "inspection_date": "",
            "headers": headers,
            "rows": rows,
            "meta": {"row_map": meta_rows, "judgment_col": None},
        }

    def _parse_standard(self, ws, sheet_name):
        """Standard row-per-record parsing with multi-level header support."""
        headers = []
        rows = []

        # Find the first row with data to determine header
        header_row = None
        for row in range(1, min(20, ws.max_row + 1)):
            non_empty = 0
            has_chinese = False
            for col in range(1, min(ws.max_column + 1, 200)):
                val = self._cell_val(ws, row, col)
                if val is not None:
                    non_empty += 1
                    if re.search(r"[\u4e00-\u9fff]", str(val)):
                        has_chinese = True
            if non_empty >= 3 and has_chinese:
                # Skip title/company rows (few cells with long text)
                texts = []
                for col in range(1, min(ws.max_column + 1, 200)):
                    val = self._cell_val(ws, row, col)
                    if val:
                        texts.append(str(val).strip())
                joined = " ".join(texts)
                if ("有限公司" in joined or "记录表" in joined) and non_empty <= 4:
                    continue
                header_row = row
                break

        if not header_row:
            return {
                "equipment_id": sheet_name,
                "inspection_date": "",
                "headers": [],
                "rows": [],
            }

        # Build main header map: col -> label
        main_headers = {}
        judgment_col = None
        for col in range(1, min(ws.max_column + 1, 200)):
            val = self._cell_val(ws, header_row, col)
            if val:
                label = str(val).replace("\n", " ").strip()
                if label in _JUDGMENT_LABELS:
                    judgment_col = col
                    continue
                main_headers[col] = label

        # Check for sub-header row(s) — up to 2 rows below main header
        sub_headers = {}
        data_start = header_row + 1
        for sub_offset in range(1, 3):
            sub_row = header_row + sub_offset
            if sub_row > (ws.max_row or 0):
                break

            sub_cells = {}
            for col in range(1, min(ws.max_column + 1, 200)):
                val = self._cell_val(ws, sub_row, col)
                if val:
                    sub_cells[col] = str(val).replace("\n", " ").strip()

            if len(sub_cells) < 2:
                break

            # Check if this is a sub-header (not a data row)
            first_vals = [v for _, v in sorted(sub_cells.items())[:3]]
            first_text = first_vals[0] if first_vals else ""

            # Date patterns → data row, stop
            if re.match(r"^\d{1,4}[/\-年.]", first_text):
                break

            # All-numeric row → index row (e.g., 1,2,3,4), skip it
            all_numeric = all(re.match(r"^[\d.]+$", v) for v in sub_cells.values())
            if all_numeric:
                data_start = sub_row + 1
                continue

            # Has Chinese text → sub-header row
            has_chinese_sub = any(
                re.search(r"[\u4e00-\u9fff]", v) for v in sub_cells.values()
            )
            # Has English labels (VF(V), IR(uA), 1st, 2nd etc.)
            has_alpha_sub = any(
                re.search(r"[a-zA-Z]", v) for v in sub_cells.values()
            )

            if has_chinese_sub or has_alpha_sub:
                for col, label in sub_cells.items():
                    if label in _JUDGMENT_LABELS:
                        judgment_col = col
                    else:
                        sub_headers[col] = label
                data_start = sub_row + 1
            else:
                break

        # Merge main + sub headers into final column map
        col_headers = {}
        if sub_headers:
            main_cols = sorted(main_headers.keys())
            for col, sub_label in sub_headers.items():
                if sub_label in _SKIP_LABELS:
                    continue
                parent = _find_parent(col, main_cols, main_headers)
                key = f"col_{col}"
                group = parent if parent and parent not in _SKIP_LABELS else "data"
                headers.append({"key": key, "label": sub_label, "group": group})
                col_headers[col] = key

            # Include main header columns with no sub-headers
            sub_col_set = set(sub_headers.keys())
            for col, label in main_headers.items():
                if label in _SKIP_LABELS:
                    continue
                has_sub = _has_sub_columns(col, main_cols, sub_col_set)
                if not has_sub:
                    key = f"col_{col}"
                    if key not in {v for v in col_headers.values()}:
                        headers.append({"key": key, "label": label, "group": "data"})
                        col_headers[col] = key
        else:
            for col, label in main_headers.items():
                key = f"col_{col}"
                headers.append({"key": key, "label": label, "group": "data"})
                col_headers[col] = key

        # Read data rows
        meta_rows = []
        for row in range(data_start, ws.max_row + 1):
            values = {}
            cells = {}
            has_data = False
            for col, key in col_headers.items():
                val = self._cell_val(ws, row, col)
                if val is not None:
                    has_data = True
                values[key] = val
                cells[key] = [row, col]

            if has_data:
                first_val = self._cell_val(ws, row, 1)
                if first_val and ("备注" in str(first_val) or "REV" in str(first_val)):
                    break
                rows.append({
                    "date": "",
                    "time": "",
                    "values": values,
                    "extra": {},
                })
                meta_rows.append({"row": row, "cells": cells})

        return {
            "equipment_id": sheet_name,
            "inspection_date": "",
            "headers": headers,
            "rows": rows,
            "meta": {"row_map": meta_rows, "judgment_col": judgment_col},
        }


def _find_parent(col, main_cols, main_headers):
    """Find the parent main header label for a sub-header column."""
    parent_col = None
    for mc in main_cols:
        if mc <= col:
            parent_col = mc
        else:
            break
    return main_headers.get(parent_col) if parent_col else None


def _has_sub_columns(main_col, main_cols, sub_col_set):
    """Check if a main header column has any sub-columns under its span."""
    idx = main_cols.index(main_col)
    next_col = main_cols[idx + 1] if idx + 1 < len(main_cols) else main_col + 20
    for sc in sub_col_set:
        if main_col <= sc < next_col:
            return True
    return False
