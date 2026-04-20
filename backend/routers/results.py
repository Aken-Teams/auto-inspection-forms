"""Results query API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional

from database import get_db
from models import UploadRecord, InspectionResult, FormType

router = APIRouter(prefix="/api/results", tags=["results"])


@router.get("")
def list_uploads(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    form_code: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List all upload records with summary."""
    query = db.query(UploadRecord).options(joinedload(UploadRecord.form_type))

    if form_code:
        form_type = db.query(FormType).filter(FormType.form_code == form_code).first()
        if form_type:
            query = query.filter(UploadRecord.form_type_id == form_type.id)

    if status:
        query = query.filter(UploadRecord.status == status)

    total = query.count()
    uploads = query.order_by(UploadRecord.upload_time.desc()).offset((page - 1) * page_size).limit(page_size).all()

    results = []
    for upload in uploads:
        # Get result counts
        sheet_results = db.query(InspectionResult).filter(InspectionResult.upload_id == upload.id).all()
        ok_count = sum(1 for r in sheet_results if r.overall_result == "OK")
        ng_count = sum(1 for r in sheet_results if r.overall_result == "NG")
        no_spec_count = sum(1 for r in sheet_results if r.overall_result == "NO_SPEC")

        results.append({
            "id": upload.id,
            "filename": upload.original_filename,
            "form_code": upload.form_type.form_code if upload.form_type else None,
            "form_name": upload.form_type.form_name if upload.form_type else "未识别",
            "upload_time": upload.upload_time.isoformat() if upload.upload_time else None,
            "status": upload.status,
            "total_sheets": upload.total_sheets,
            "ok_count": ok_count,
            "ng_count": ng_count,
            "no_spec_count": no_spec_count,
        })

    return {"total": total, "page": page, "page_size": page_size, "items": results}


@router.get("/{upload_id}")
def get_upload_detail(upload_id: int, db: Session = Depends(get_db)):
    """Get detailed results for a specific upload."""
    upload = db.query(UploadRecord).options(joinedload(UploadRecord.form_type)).get(upload_id)
    if not upload:
        raise HTTPException(404, "Upload not found")

    sheet_results = db.query(InspectionResult).filter(
        InspectionResult.upload_id == upload_id
    ).all()

    return {
        "id": upload.id,
        "filename": upload.original_filename,
        "form_code": upload.form_type.form_code if upload.form_type else None,
        "form_name": upload.form_type.form_name if upload.form_type else "未识别",
        "upload_time": upload.upload_time.isoformat() if upload.upload_time else None,
        "status": upload.status,
        "error_message": upload.error_message,
        "sheets": [
            {
                "id": r.id,
                "sheet_name": r.sheet_name,
                "equipment_id": r.equipment_id,
                "has_spec": r.has_spec,
                "overall_result": r.overall_result,
                "inspection_date": r.inspection_date,
                "judged_data": r.judged_data,
                "raw_data": r.raw_data,
            }
            for r in sheet_results
        ],
    }


@router.get("/sheet/{result_id}")
def get_sheet_result(result_id: int, db: Session = Depends(get_db)):
    """Get detailed result for a specific sheet."""
    result = db.query(InspectionResult).get(result_id)
    if not result:
        raise HTTPException(404, "Result not found")

    return {
        "id": result.id,
        "upload_id": result.upload_id,
        "sheet_name": result.sheet_name,
        "equipment_id": result.equipment_id,
        "has_spec": result.has_spec,
        "overall_result": result.overall_result,
        "inspection_date": result.inspection_date,
        "raw_data": result.raw_data,
        "judged_data": result.judged_data,
    }
