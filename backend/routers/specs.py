"""Spec management API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional
import os
import uuid

from database import get_db
from models import FormType, FormSpec, SpecItem
from services.spec_service import import_specs_from_excel, init_form_types
from config import UPLOAD_DIR

router = APIRouter(prefix="/api/specs", tags=["specs"])


class SpecItemUpdate(BaseModel):
    item_name: str
    spec_type: str
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    expected_text: Optional[str] = None
    threshold_value: Optional[float] = None
    threshold_operator: Optional[str] = None
    group_name: Optional[str] = None
    sub_group: Optional[str] = None


class FormSpecUpdate(BaseModel):
    equipment_name: Optional[str] = None
    items: Optional[list[SpecItemUpdate]] = None


class FormSpecPatch(BaseModel):
    equipment_name: Optional[str] = None


class FormSpecCreate(BaseModel):
    equipment_id: str
    equipment_name: str


class FormTypeCreate(BaseModel):
    form_code: str
    form_name: str
    file_pattern: Optional[str] = None
    description: Optional[str] = None


class FormTypePatch(BaseModel):
    form_name: Optional[str] = None
    file_pattern: Optional[str] = None
    description: Optional[str] = None


@router.get("/form-types")
def list_form_types(db: Session = Depends(get_db)):
    """List all form types."""
    types = db.query(FormType).all()
    return [
        {
            "id": ft.id,
            "form_code": ft.form_code,
            "form_name": ft.form_name,
            "description": ft.description,
            "file_pattern": ft.file_pattern,
            "is_builtin": ft.is_builtin,
            "spec_count": db.query(FormSpec).filter(FormSpec.form_type_id == ft.id).count(),
        }
        for ft in types
    ]


@router.post("/form-types")
def create_form_type(data: FormTypeCreate, db: Session = Depends(get_db)):
    """Create a new custom form type."""
    existing = db.query(FormType).filter(FormType.form_code == data.form_code).first()
    if existing:
        raise HTTPException(409, f"Form type {data.form_code} already exists")

    ft = FormType(
        form_code=data.form_code,
        form_name=data.form_name,
        file_pattern=data.file_pattern,
        description=data.description,
        is_builtin=False,
    )
    db.add(ft)
    db.commit()
    return {"success": True, "id": ft.id, "form_code": ft.form_code}


@router.patch("/form-types/{form_code}")
def patch_form_type(form_code: str, data: FormTypePatch, db: Session = Depends(get_db)):
    """Update a form type (name, file_pattern, description)."""
    ft = db.query(FormType).filter(FormType.form_code == form_code).first()
    if not ft:
        raise HTTPException(404, f"Form type {form_code} not found")
    if data.form_name is not None:
        ft.form_name = data.form_name
    if data.file_pattern is not None:
        ft.file_pattern = data.file_pattern
    if data.description is not None:
        ft.description = data.description
    db.commit()
    return {"success": True}


@router.delete("/form-types/{form_code}")
def delete_form_type(form_code: str, db: Session = Depends(get_db)):
    """Delete a custom form type and all its specs."""
    ft = db.query(FormType).filter(FormType.form_code == form_code).first()
    if not ft:
        raise HTTPException(404, f"Form type {form_code} not found")
    if ft.is_builtin:
        raise HTTPException(400, "Cannot delete built-in form types")
    db.delete(ft)
    db.commit()
    return {"success": True}


@router.get("/form-types/{form_code}/specs")
def list_specs(form_code: str, include_items: bool = True, db: Session = Depends(get_db)):
    """List all specs for a form type."""
    form_type = db.query(FormType).filter(FormType.form_code == form_code).first()
    if not form_type:
        raise HTTPException(404, f"Form type {form_code} not found")

    specs = db.query(FormSpec).filter(
        FormSpec.form_type_id == form_type.id
    ).options(joinedload(FormSpec.items)).all()

    if not include_items:
        return [
            {
                "id": s.id,
                "equipment_id": s.equipment_id,
                "equipment_name": s.equipment_name,
                "extra_info": s.extra_info,
                "item_count": len(s.items),
            }
            for s in specs
        ]

    return [
        {
            "id": s.id,
            "equipment_id": s.equipment_id,
            "equipment_name": s.equipment_name,
            "extra_info": s.extra_info,
            "items": [
                {
                    "id": item.id,
                    "item_name": item.item_name,
                    "spec_type": item.spec_type,
                    "min_value": float(item.min_value) if item.min_value else None,
                    "max_value": float(item.max_value) if item.max_value else None,
                    "expected_text": item.expected_text,
                    "threshold_value": float(item.threshold_value) if item.threshold_value else None,
                    "threshold_operator": item.threshold_operator,
                    "display_order": item.display_order,
                    "group_name": item.group_name,
                    "sub_group": item.sub_group,
                }
                for item in sorted(s.items, key=lambda x: x.display_order)
            ],
        }
        for s in specs
    ]


@router.put("/specs/{spec_id}")
def update_spec(spec_id: int, data: FormSpecUpdate, db: Session = Depends(get_db)):
    """Update a spec and its items."""
    spec = db.query(FormSpec).get(spec_id)
    if not spec:
        raise HTTPException(404, "Spec not found")

    if data.equipment_name:
        spec.equipment_name = data.equipment_name

    if data.items is not None:
        # Clear existing items and replace
        db.query(SpecItem).filter(SpecItem.form_spec_id == spec_id).delete()
        for i, item_data in enumerate(data.items):
            item = SpecItem(
                form_spec_id=spec_id,
                item_name=item_data.item_name,
                spec_type=item_data.spec_type,
                min_value=item_data.min_value,
                max_value=item_data.max_value,
                expected_text=item_data.expected_text,
                threshold_value=item_data.threshold_value,
                threshold_operator=item_data.threshold_operator,
                display_order=i,
                group_name=item_data.group_name,
                sub_group=item_data.sub_group,
            )
            db.add(item)

    db.commit()
    return {"success": True}


@router.delete("/specs/{spec_id}")
def delete_spec(spec_id: int, db: Session = Depends(get_db)):
    """Delete a spec group and all its items."""
    spec = db.query(FormSpec).get(spec_id)
    if not spec:
        raise HTTPException(404, "Spec not found")
    db.query(SpecItem).filter(SpecItem.form_spec_id == spec_id).delete()
    db.delete(spec)
    db.commit()
    return {"success": True}


@router.patch("/specs/{spec_id}")
def patch_spec(spec_id: int, data: FormSpecPatch, db: Session = Depends(get_db)):
    """Rename a spec group (update equipment_name)."""
    spec = db.query(FormSpec).get(spec_id)
    if not spec:
        raise HTTPException(404, "Spec not found")
    if data.equipment_name is not None:
        spec.equipment_name = data.equipment_name
    db.commit()
    return {"success": True}


@router.post("/form-types/{form_code}/specs")
def create_spec(form_code: str, data: FormSpecCreate, db: Session = Depends(get_db)):
    """Create a new empty spec group."""
    form_type = db.query(FormType).filter(FormType.form_code == form_code).first()
    if not form_type:
        raise HTTPException(404, f"Form type {form_code} not found")

    existing = db.query(FormSpec).filter(
        FormSpec.form_type_id == form_type.id,
        FormSpec.equipment_id == data.equipment_id,
    ).first()
    if existing:
        raise HTTPException(409, f"Spec for equipment {data.equipment_id} already exists")

    spec = FormSpec(
        form_type_id=form_type.id,
        equipment_id=data.equipment_id,
        equipment_name=data.equipment_name,
    )
    db.add(spec)
    db.commit()
    return {"success": True, "id": spec.id}


@router.post("/import")
async def import_specs(
    form_code: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Import specs from an Excel file's 汇总 sheet."""
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    filepath = os.path.join(UPLOAD_DIR, f"spec_{uuid.uuid4().hex}_{file.filename}")

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    try:
        result = import_specs_from_excel(db, filepath, form_code)
        return result
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)


@router.post("/init")
def initialize_form_types(db: Session = Depends(get_db)):
    """Initialize form types in database."""
    init_form_types(db)
    return {"success": True, "message": "Form types initialized"}
