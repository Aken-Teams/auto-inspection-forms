"""Download/export API endpoints."""
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models import UploadRecord, InspectionResult
from services.export_service import export_result_to_excel, export_upload_results, export_batch_results

router = APIRouter(prefix="/api/download", tags=["download"])


class BatchDownloadRequest(BaseModel):
    upload_ids: list[int]


@router.get("/sheet/{result_id}")
def download_sheet(result_id: int, db: Session = Depends(get_db)):
    """Download a single sheet result as Excel."""
    result = db.query(InspectionResult).get(result_id)
    if not result:
        raise HTTPException(404, "Result not found")

    excel_data = export_result_to_excel(result)
    filename = f"{result.sheet_name}_判定结果.xlsx"

    return StreamingResponse(
        excel_data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@router.get("/upload/{upload_id}")
def download_upload(upload_id: int, db: Session = Depends(get_db)):
    """Download all sheet results for an upload as a single Excel."""
    upload = db.query(UploadRecord).get(upload_id)
    if not upload:
        raise HTTPException(404, "Upload not found")

    excel_data = export_upload_results(db, upload_id)
    filename = upload.original_filename.replace(".xlsx", "_判定结果.xlsx")

    return StreamingResponse(
        excel_data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@router.post("/batch")
def download_batch(request: BatchDownloadRequest, db: Session = Depends(get_db)):
    """Download multiple upload results as a ZIP file."""
    if not request.upload_ids:
        raise HTTPException(400, "No upload IDs provided")

    zip_data = export_batch_results(db, request.upload_ids)

    return StreamingResponse(
        zip_data,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=inspection_results.zip"},
    )
