"""Results query API endpoints."""
import json
import os
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func as sql_func, case, distinct
from typing import Optional

from database import get_db
from models import UploadRecord, InspectionResult, FormType
from config import UPLOAD_DIR

router = APIRouter(prefix="/api/results", tags=["results"])


def _rejudge_result(db: Session, result: InspectionResult, form_code: str | None) -> dict:
    """Re-judge a result using current specs, returning fresh judged_data."""
    raw_data = result.raw_data if isinstance(result.raw_data, dict) else json.loads(result.raw_data or "{}")

    if form_code and raw_data.get("rows"):
        from services.judgment import judge_sheet_data
        return judge_sheet_data(db, form_code, result.equipment_id, raw_data)

    return result.judged_data if isinstance(result.judged_data, dict) else json.loads(result.judged_data or "{}")


@router.get("/batches")
def list_batches(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List upload batches grouped by batch_id.

    Records without batch_id are treated as individual batches.
    Optimized: uses 2 SQL queries total (no N+1).
    """
    # Assign batch_id to orphan records (bulk update, no loading into Python)
    import uuid as _uuid
    from sqlalchemy import update
    orphan_count = db.query(sql_func.count(UploadRecord.id)).filter(
        (UploadRecord.batch_id == None) | (UploadRecord.batch_id == "")
    ).scalar()
    if orphan_count:
        orphans = db.query(UploadRecord).filter(
            (UploadRecord.batch_id == None) | (UploadRecord.batch_id == "")
        ).all()
        for rec in orphans:
            rec.batch_id = _uuid.uuid4().hex
        db.commit()

    # Query 1: Get paginated batch summary
    batch_q = (
        db.query(
            UploadRecord.batch_id,
            sql_func.count(UploadRecord.id).label("file_count"),
            sql_func.min(UploadRecord.upload_time).label("upload_time"),
        )
        .filter(UploadRecord.batch_id.isnot(None))
        .group_by(UploadRecord.batch_id)
        .order_by(sql_func.min(UploadRecord.upload_time).desc())
    )

    total = batch_q.count()
    batches = batch_q.offset((page - 1) * page_size).limit(page_size).all()

    if not batches:
        return {"total": total, "page": page, "page_size": page_size, "items": []}

    batch_ids = [b.batch_id for b in batches]

    # Query 2: Get ALL uploads + result counts for these batches in ONE query
    upload_stats = (
        db.query(
            UploadRecord.id,
            UploadRecord.batch_id,
            UploadRecord.original_filename,
            UploadRecord.total_sheets,
            UploadRecord.status,
            FormType.form_code,
            FormType.form_name,
            sql_func.count(case((InspectionResult.overall_result == "OK", 1))).label("ok_count"),
            sql_func.count(case((InspectionResult.overall_result == "NG", 1))).label("ng_count"),
            sql_func.count(case((InspectionResult.overall_result == "NO_SPEC", 1))).label("no_spec_count"),
        )
        .outerjoin(FormType, UploadRecord.form_type_id == FormType.id)
        .outerjoin(InspectionResult, InspectionResult.upload_id == UploadRecord.id)
        .filter(UploadRecord.batch_id.in_(batch_ids))
        .group_by(UploadRecord.id)
        .order_by(UploadRecord.id)
        .all()
    )

    # Group by batch_id in Python (data already in memory, no extra queries)
    from collections import defaultdict
    batch_uploads = defaultdict(list)
    for row in upload_stats:
        batch_uploads[row.batch_id].append(row)

    results = []
    for batch_id, file_count, upload_time in batches:
        uploads = batch_uploads.get(batch_id, [])
        total_ok = sum(u.ok_count for u in uploads)
        total_ng = sum(u.ng_count for u in uploads)
        total_no_spec = sum(u.no_spec_count for u in uploads)
        total_sheets = sum(u.total_sheets or 0 for u in uploads)
        form_types_seen = {u.form_code for u in uploads if u.form_code}

        files = [{
            "id": u.id,
            "filename": u.original_filename,
            "form_code": u.form_code,
            "form_name": u.form_name,
            "total_sheets": u.total_sheets,
            "ok_count": u.ok_count,
            "ng_count": u.ng_count,
            "no_spec_count": u.no_spec_count,
            "status": u.status,
        } for u in uploads]

        results.append({
            "batch_id": batch_id,
            "upload_time": upload_time.isoformat() if upload_time else None,
            "file_count": file_count,
            "total_sheets": total_sheets,
            "ok_count": total_ok,
            "ng_count": total_ng,
            "no_spec_count": total_no_spec,
            "form_types": list(form_types_seen),
            "files": files,
        })

    return {"total": total, "page": page, "page_size": page_size, "items": results}


@router.get("")
def list_uploads(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    form_code: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List all upload records with summary (optimized: single query with aggregation)."""
    query = (
        db.query(
            UploadRecord.id,
            UploadRecord.original_filename,
            UploadRecord.upload_time,
            UploadRecord.status,
            UploadRecord.total_sheets,
            FormType.form_code,
            FormType.form_name,
            sql_func.count(case((InspectionResult.overall_result == "OK", 1))).label("ok_count"),
            sql_func.count(case((InspectionResult.overall_result == "NG", 1))).label("ng_count"),
            sql_func.count(case((InspectionResult.overall_result == "NO_SPEC", 1))).label("no_spec_count"),
        )
        .outerjoin(FormType, UploadRecord.form_type_id == FormType.id)
        .outerjoin(InspectionResult, InspectionResult.upload_id == UploadRecord.id)
    )

    if form_code:
        query = query.filter(FormType.form_code == form_code)
    if status:
        query = query.filter(UploadRecord.status == status)

    query = query.group_by(UploadRecord.id)

    total = query.count()
    uploads = query.order_by(UploadRecord.upload_time.desc()).offset((page - 1) * page_size).limit(page_size).all()

    results = [{
        "id": u.id,
        "filename": u.original_filename,
        "form_code": u.form_code,
        "form_name": u.form_name or "未识别",
        "upload_time": u.upload_time.isoformat() if u.upload_time else None,
        "status": u.status,
        "total_sheets": u.total_sheets,
        "ok_count": u.ok_count,
        "ng_count": u.ng_count,
        "no_spec_count": u.no_spec_count,
    } for u in uploads]

    return {"total": total, "page": page, "page_size": page_size, "items": results}


@router.get("/{upload_id}")
def get_upload_detail(upload_id: int, db: Session = Depends(get_db)):
    """Get detailed results for a specific upload.

    Re-judges each sheet with current specs so preview always reflects
    the latest spec configuration.
    """
    upload = db.query(UploadRecord).options(joinedload(UploadRecord.form_type)).get(upload_id)
    if not upload:
        raise HTTPException(404, "Upload not found")

    form_code = upload.form_type.form_code if upload.form_type else None

    sheet_results = db.query(InspectionResult).filter(
        InspectionResult.upload_id == upload_id
    ).all()

    sheets = []
    for r in sheet_results:
        judged = _rejudge_result(db, r, form_code)
        sheets.append({
            "id": r.id,
            "sheet_name": r.sheet_name,
            "equipment_id": r.equipment_id,
            "has_spec": judged.get("has_spec", r.has_spec),
            "overall_result": judged.get("overall_result", r.overall_result),
            "inspection_date": r.inspection_date,
            "judged_data": judged,
            "raw_data": r.raw_data,
        })

    return {
        "id": upload.id,
        "filename": upload.original_filename,
        "form_code": upload.form_type.form_code if upload.form_type else None,
        "form_name": upload.form_type.form_name if upload.form_type else "未识别",
        "upload_time": upload.upload_time.isoformat() if upload.upload_time else None,
        "status": upload.status,
        "error_message": upload.error_message,
        "sheets": sheets,
    }


@router.get("/sheet/{result_id}")
def get_sheet_result(result_id: int, db: Session = Depends(get_db)):
    """Get detailed result for a specific sheet.

    Re-judges with current specs so preview always reflects latest spec configuration.
    """
    result = db.query(InspectionResult).get(result_id)
    if not result:
        raise HTTPException(404, "Result not found")

    upload = db.query(UploadRecord).options(joinedload(UploadRecord.form_type)).get(result.upload_id)
    form_code = upload.form_type.form_code if upload and upload.form_type else None
    judged = _rejudge_result(db, result, form_code)

    return {
        "id": result.id,
        "upload_id": result.upload_id,
        "sheet_name": result.sheet_name,
        "equipment_id": result.equipment_id,
        "has_spec": judged.get("has_spec", result.has_spec),
        "overall_result": judged.get("overall_result", result.overall_result),
        "inspection_date": result.inspection_date,
        "raw_data": result.raw_data,
        "judged_data": judged,
    }


@router.delete("/batches/{batch_id}")
def delete_batch(batch_id: str, db: Session = Depends(get_db)):
    """Delete an entire upload batch and its files/results."""
    # Only load stored_filename for file cleanup (lightweight query)
    uploads = db.query(UploadRecord.id, UploadRecord.stored_filename).filter(
        UploadRecord.batch_id == batch_id
    ).all()
    if not uploads:
        raise HTTPException(404, "Batch not found")

    # Delete files from disk first
    for _, stored_filename in uploads:
        filepath = os.path.join(UPLOAD_DIR, stored_filename)
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
            except OSError:
                pass

    upload_ids = [u.id for u in uploads]

    # Bulk delete InspectionResults then UploadRecords (faster than cascade one-by-one)
    db.query(InspectionResult).filter(
        InspectionResult.upload_id.in_(upload_ids)
    ).delete(synchronize_session=False)
    db.query(UploadRecord).filter(
        UploadRecord.batch_id == batch_id
    ).delete(synchronize_session=False)

    db.commit()
    return {"success": True, "deleted_files": len(uploads)}
