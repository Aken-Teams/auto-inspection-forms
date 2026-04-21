"""Service for exporting inspection results by annotating original Excel files."""
import io
import json
import logging
import os
import zipfile
from copy import copy
from openpyxl import load_workbook
from openpyxl.styles import PatternFill, Font
from sqlalchemy.orm import Session
from models import InspectionResult, UploadRecord
from config import UPLOAD_DIR

logger = logging.getLogger(__name__)

# Color fills for judgment
FILL_OK = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
FILL_NG = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
FONT_NG = Font(color="FF0000", bold=True)
FONT_OK = Font(bold=True)


def _get_judged_data_for_export(db: Session, result: InspectionResult, form_code: str | None) -> dict:
    """Get judged data for export, re-judging with current specs if possible.

    This ensures the export always uses the LATEST specs, even if specs were
    added/updated after the file was uploaded.
    """
    raw_data = result.raw_data if isinstance(result.raw_data, dict) else json.loads(result.raw_data or "{}")

    # Re-judge using current specs if we have raw_data with rows
    if form_code and raw_data.get("rows"):
        from services.judgment import judge_sheet_data
        judged = judge_sheet_data(db, form_code, result.equipment_id, raw_data)
        logger.info(f"Re-judged sheet {result.sheet_name}: has_spec={judged.get('has_spec')}, "
                     f"meta={'yes' if judged.get('meta') else 'no'}, "
                     f"rows={len(judged.get('judged_rows', []))}")
        return judged

    # Fallback to stored judged_data
    judged_data = result.judged_data if isinstance(result.judged_data, dict) else json.loads(result.judged_data or "{}")

    # If stored judged_data has no meta, try to get it from raw_data
    if not judged_data.get("meta") and raw_data.get("meta"):
        judged_data["meta"] = raw_data["meta"]

    return judged_data


def export_upload_results(db: Session, upload_id: int) -> io.BytesIO:
    """Export results by annotating the original uploaded Excel file.

    Opens the original file, re-judges with current specs, and writes
    OK/NG results with color coding.
    """
    upload = db.query(UploadRecord).get(upload_id)
    if not upload:
        raise ValueError(f"Upload {upload_id} not found")

    results = db.query(InspectionResult).filter(
        InspectionResult.upload_id == upload_id
    ).all()

    # Build lookup: sheet_name -> InspectionResult
    result_map = {}
    for r in results:
        result_map[r.sheet_name] = r

    # Open original file
    filepath = os.path.join(UPLOAD_DIR, upload.stored_filename)
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Original file not found: {filepath}")

    form_code = upload.form_type.form_code if upload.form_type else None

    wb = load_workbook(filepath)

    for sheet_name in wb.sheetnames:
        if sheet_name not in result_map:
            continue

        result = result_map[sheet_name]
        ws = wb[sheet_name]
        judged_data = _get_judged_data_for_export(db, result, form_code)
        _annotate_sheet(ws, judged_data)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output


def export_result_to_excel(db: Session, result: InspectionResult) -> io.BytesIO:
    """Export a single sheet result by annotating the original file."""
    upload = db.query(UploadRecord).get(result.upload_id)
    if not upload:
        raise ValueError(f"Upload {result.upload_id} not found")

    filepath = os.path.join(UPLOAD_DIR, upload.stored_filename)
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Original file not found: {filepath}")

    form_code = upload.form_type.form_code if upload.form_type else None

    wb = load_workbook(filepath)

    if result.sheet_name in wb.sheetnames:
        ws = wb[result.sheet_name]
        judged_data = _get_judged_data_for_export(db, result, form_code)
        _annotate_sheet(ws, judged_data)

    # Remove other sheets
    for sn in wb.sheetnames:
        if sn != result.sheet_name:
            del wb[sn]

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output


def export_batch_results(db: Session, upload_ids: list[int]) -> io.BytesIO:
    """Export multiple uploads as a ZIP of annotated Excel files."""
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


def _annotate_sheet(ws, judged_data: dict):
    """Annotate an original worksheet with judgment results.

    1. Clear existing judgment column values
    2. Write OK/NG into judgment column (if exists)
    3. Apply color fills to value cells based on judgment
    """
    judged_rows = judged_data.get("judged_rows", [])
    has_spec = judged_data.get("has_spec", False)
    meta = judged_data.get("meta")

    logger.info(f"_annotate_sheet: has_spec={has_spec}, meta={'yes' if meta else 'no'}, "
                f"judged_rows={len(judged_rows)}")

    if not judged_rows or not meta:
        logger.warning(f"_annotate_sheet: skipping - no judged_rows or no meta")
        return

    row_map = meta.get("row_map", [])
    judgment_col = meta.get("judgment_col")

    if len(row_map) != len(judged_rows):
        logger.warning(f"_annotate_sheet: row count mismatch - row_map={len(row_map)}, judged_rows={len(judged_rows)}, annotating min overlap")
        # Annotate as many rows as we can instead of giving up entirely

    # Step 1: Clear judgment column if it exists
    if judgment_col:
        for rm in row_map:
            excel_row = rm.get("row")
            if excel_row:
                cell = ws.cell(row=excel_row, column=judgment_col)
                cell.value = None
                cell.fill = PatternFill()  # Clear fill

    # Step 2: Write judgments and apply color fills
    for i, jr in enumerate(judged_rows):
        if i >= len(row_map):
            break

        rm = row_map[i]
        cells_map = rm.get("cells", {})
        row_has_ng = False

        # Apply color fills to individual value cells
        for key, val_data in jr.get("values", {}).items():
            if not isinstance(val_data, dict):
                continue

            judgment = val_data.get("judgment", "SKIP")
            cell_pos = cells_map.get(key)

            if not cell_pos or not has_spec:
                continue

            excel_row, excel_col = cell_pos

            if judgment == "OK":
                cell = ws.cell(row=excel_row, column=excel_col)
                cell.fill = FILL_OK
            elif judgment == "NG":
                cell = ws.cell(row=excel_row, column=excel_col)
                cell.fill = FILL_NG
                cell.font = FONT_NG
                row_has_ng = True

        # Write row judgment into judgment column
        if judgment_col and has_spec:
            excel_row = rm.get("row")
            if excel_row:
                judge_cell = ws.cell(row=excel_row, column=judgment_col)
                judge_cell.value = "NG" if row_has_ng else "OK"
                judge_cell.fill = FILL_NG if row_has_ng else FILL_OK
                judge_cell.font = FONT_NG if row_has_ng else FONT_OK
