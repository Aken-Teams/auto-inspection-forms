"""Service for exporting inspection results as Excel files."""
import io
import json
import zipfile
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from sqlalchemy.orm import Session
from models import InspectionResult, UploadRecord


# Color fills for judgment
FILL_OK = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
FILL_NG = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
FILL_NO_SPEC = PatternFill(start_color="FFFFCC", end_color="FFFFCC", fill_type="solid")
FILL_HEADER = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
FONT_HEADER = Font(color="FFFFFF", bold=True, size=10)
FONT_NG = Font(color="FF0000", bold=True)
THIN_BORDER = Border(
    left=Side(style="thin"),
    right=Side(style="thin"),
    top=Side(style="thin"),
    bottom=Side(style="thin"),
)


def export_result_to_excel(result: InspectionResult) -> io.BytesIO:
    """Export a single inspection result to Excel."""
    wb = Workbook()
    ws = wb.active
    ws.title = result.sheet_name[:31]  # Excel max sheet name length

    judged_data = result.judged_data if isinstance(result.judged_data, dict) else json.loads(result.judged_data or "{}")
    _write_result_sheet(ws, result, judged_data)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output


def export_upload_results(db: Session, upload_id: int) -> io.BytesIO:
    """Export all results for an upload as a single Excel with multiple sheets."""
    results = db.query(InspectionResult).filter(InspectionResult.upload_id == upload_id).all()

    wb = Workbook()
    wb.remove(wb.active)  # Remove default sheet

    for result in results:
        sheet_name = result.sheet_name[:31]
        # Ensure unique sheet name
        existing = [ws.title for ws in wb.worksheets]
        if sheet_name in existing:
            sheet_name = sheet_name[:28] + f"_{len(existing)}"

        ws = wb.create_sheet(title=sheet_name)
        judged_data = result.judged_data if isinstance(result.judged_data, dict) else json.loads(result.judged_data or "{}")
        _write_result_sheet(ws, result, judged_data)

    if not wb.worksheets:
        wb.create_sheet(title="No Data")

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output


def export_batch_results(db: Session, upload_ids: list[int]) -> io.BytesIO:
    """Export multiple uploads as a ZIP of Excel files."""
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for upload_id in upload_ids:
            upload = db.query(UploadRecord).get(upload_id)
            if not upload:
                continue

            excel_data = export_upload_results(db, upload_id)
            filename = upload.original_filename.replace(".xlsx", "_判定结果.xlsx")
            zf.writestr(filename, excel_data.read())

    zip_buffer.seek(0)
    return zip_buffer


def _write_result_sheet(ws, result: InspectionResult, judged_data: dict):
    """Write judged data to a worksheet."""
    judged_rows = judged_data.get("judged_rows", [])
    summary = judged_data.get("summary", {})
    has_spec = judged_data.get("has_spec", False)

    # Title row
    ws.cell(row=1, column=1, value=f"检查结果 - {result.sheet_name}")
    ws.cell(row=1, column=1).font = Font(bold=True, size=14)

    # Status row
    status_cell = ws.cell(row=2, column=1)
    if not has_spec:
        status_cell.value = "⚠ 规格未设定 - 仅显示原始数据"
        status_cell.fill = FILL_NO_SPEC
        status_cell.font = Font(bold=True, size=11)
    else:
        overall = judged_data.get("overall_result", "OK")
        status_cell.value = f"整体判定: {overall} (OK: {summary.get('ok', 0)} / NG: {summary.get('ng', 0)})"
        status_cell.fill = FILL_OK if overall == "OK" else FILL_NG
        status_cell.font = Font(bold=True, size=11)

    if not judged_rows:
        ws.cell(row=4, column=1, value="无数据")
        return

    # Collect all keys from first row
    first_row = judged_rows[0]
    all_keys = list(first_row.get("values", {}).keys())

    # Header row
    header_row = 4
    headers = ["日期", "时间"] + all_keys
    if has_spec:
        headers.append("行判定")

    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=header_row, column=col, value=header)
        cell.fill = FILL_HEADER
        cell.font = FONT_HEADER
        cell.alignment = Alignment(horizontal="center")
        cell.border = THIN_BORDER

    # Spec row (if has spec)
    if has_spec:
        spec_row_num = header_row + 1
        ws.cell(row=spec_row_num, column=1, value="规格").font = Font(bold=True, italic=True)
        for col, key in enumerate(all_keys, 3):
            spec_val = ""
            for jr in judged_rows:
                s = jr.get("values", {}).get(key, {}).get("spec", "")
                if s:
                    spec_val = s
                    break
            cell = ws.cell(row=spec_row_num, column=col, value=spec_val)
            cell.font = Font(italic=True, size=9)
            cell.border = THIN_BORDER
        data_start = spec_row_num + 1
    else:
        data_start = header_row + 1

    # Data rows
    for i, jr in enumerate(judged_rows):
        row_num = data_start + i
        ws.cell(row=row_num, column=1, value=jr.get("date", "")).border = THIN_BORDER
        ws.cell(row=row_num, column=2, value=jr.get("time", "")).border = THIN_BORDER

        row_has_ng = False
        for col, key in enumerate(all_keys, 3):
            val_data = jr.get("values", {}).get(key, {})
            raw = val_data.get("raw")
            judgment = val_data.get("judgment", "SKIP")

            cell = ws.cell(row=row_num, column=col, value=raw)
            cell.border = THIN_BORDER

            if has_spec and judgment == "OK":
                cell.fill = FILL_OK
            elif has_spec and judgment == "NG":
                cell.fill = FILL_NG
                cell.font = FONT_NG
                row_has_ng = True
            elif not has_spec:
                cell.fill = FILL_NO_SPEC

        if has_spec:
            judge_cell = ws.cell(row=row_num, column=len(headers))
            judge_cell.value = "NG" if row_has_ng else "OK"
            judge_cell.fill = FILL_NG if row_has_ng else FILL_OK
            judge_cell.font = FONT_NG if row_has_ng else Font(bold=True)
            judge_cell.border = THIN_BORDER

    # Auto-width columns
    for col in range(1, len(headers) + 1):
        ws.column_dimensions[ws.cell(row=header_row, column=col).column_letter].width = 15
