"""Service for spec version management - snapshots, diffs, and rollback."""
import logging
from sqlalchemy.orm import Session
from sqlalchemy import func as sql_func
from models import FormSpec, SpecItem, SpecVersion

logger = logging.getLogger(__name__)


def _serialize_items(items: list[SpecItem]) -> list[dict]:
    """Serialize a list of SpecItem objects to dicts."""
    return [
        {
            "item_name": item.item_name,
            "spec_type": item.spec_type,
            "min_value": float(item.min_value) if item.min_value is not None else None,
            "max_value": float(item.max_value) if item.max_value is not None else None,
            "expected_text": item.expected_text,
            "threshold_value": float(item.threshold_value) if item.threshold_value is not None else None,
            "threshold_operator": item.threshold_operator,
            "display_order": item.display_order,
            "group_name": item.group_name,
            "sub_group": item.sub_group,
        }
        for item in items
    ]


def create_version_snapshot(
    db: Session,
    form_spec_id: int,
    source: str,
    source_filename: str = None,
    stored_filepath: str = None,
    file_hash: str = None,
) -> SpecVersion | None:
    """Snapshot the current state of a FormSpec's items as a new version.

    Args:
        source: "import", "manual_edit", or "rollback"
    """
    items = (
        db.query(SpecItem)
        .filter(SpecItem.form_spec_id == form_spec_id)
        .order_by(SpecItem.display_order)
        .all()
    )

    # Don't create empty snapshots (no items to snapshot)
    if not items and source != "rollback":
        return None

    items_snapshot = _serialize_items(items)

    # Get next version number
    max_ver = (
        db.query(sql_func.max(SpecVersion.version_number))
        .filter(SpecVersion.form_spec_id == form_spec_id)
        .scalar()
    ) or 0

    version = SpecVersion(
        form_spec_id=form_spec_id,
        version_number=max_ver + 1,
        source=source,
        source_filename=source_filename,
        stored_filepath=stored_filepath,
        file_hash=file_hash,
        items_snapshot=items_snapshot,
        item_count=len(items_snapshot),
    )
    db.add(version)
    db.flush()

    logger.info(
        f"Created version {version.version_number} for spec {form_spec_id} "
        f"({len(items_snapshot)} items, source={source})"
    )
    return version


def compute_diff(old_items: list[dict], new_items: list[dict]) -> dict:
    """Compute diff between two sets of spec items.

    Items are matched by (item_name, group_name, sub_group) key.

    Returns:
        {
            "added": [...],
            "removed": [...],
            "modified": [{"item_name": ..., "old": {...}, "new": {...}, "changes": [...]}],
            "unchanged": [...],
            "summary": {"added": N, "removed": N, "modified": N, "unchanged": N}
        }
    """

    def _item_key(item: dict) -> tuple:
        return (
            item.get("item_name", ""),
            item.get("group_name") or "",
            item.get("sub_group") or "",
        )

    def _spec_fields(item: dict) -> dict:
        """Extract the spec-relevant fields for comparison."""
        return {
            "spec_type": item.get("spec_type"),
            "min_value": item.get("min_value"),
            "max_value": item.get("max_value"),
            "expected_text": item.get("expected_text"),
            "threshold_value": item.get("threshold_value"),
            "threshold_operator": item.get("threshold_operator"),
        }

    old_map = {_item_key(item): item for item in old_items}
    new_map = {_item_key(item): item for item in new_items}

    old_keys = set(old_map.keys())
    new_keys = set(new_map.keys())

    added = [new_map[k] for k in (new_keys - old_keys)]
    removed = [old_map[k] for k in (old_keys - new_keys)]
    unchanged = []
    modified = []

    for k in old_keys & new_keys:
        old_spec = _spec_fields(old_map[k])
        new_spec = _spec_fields(new_map[k])
        if old_spec == new_spec:
            unchanged.append(new_map[k])
        else:
            changes = [
                field for field in old_spec
                if old_spec[field] != new_spec[field]
            ]
            modified.append({
                "item_name": new_map[k].get("item_name"),
                "group_name": new_map[k].get("group_name"),
                "sub_group": new_map[k].get("sub_group"),
                "old": old_map[k],
                "new": new_map[k],
                "changes": changes,
            })

    return {
        "added": added,
        "removed": removed,
        "modified": modified,
        "unchanged": unchanged,
        "summary": {
            "added": len(added),
            "removed": len(removed),
            "modified": len(modified),
            "unchanged": len(unchanged),
        },
    }


def list_versions(db: Session, form_spec_id: int) -> list[dict]:
    """List all versions for a spec, newest first."""
    versions = (
        db.query(SpecVersion)
        .filter(SpecVersion.form_spec_id == form_spec_id)
        .order_by(SpecVersion.version_number.desc())
        .all()
    )
    return [
        {
            "id": v.id,
            "version_number": v.version_number,
            "source": v.source,
            "source_filename": v.source_filename,
            "file_hash": v.file_hash,
            "item_count": v.item_count,
            "change_summary": v.change_summary,
            "created_at": str(v.created_at),
        }
        for v in versions
    ]


def get_version_detail(db: Session, version_id: int) -> dict | None:
    """Get full detail of a specific version including items snapshot."""
    version = db.query(SpecVersion).get(version_id)
    if not version:
        return None
    return {
        "id": version.id,
        "form_spec_id": version.form_spec_id,
        "version_number": version.version_number,
        "source": version.source,
        "source_filename": version.source_filename,
        "stored_filepath": version.stored_filepath,
        "file_hash": version.file_hash,
        "items_snapshot": version.items_snapshot,
        "item_count": version.item_count,
        "change_summary": version.change_summary,
        "created_at": str(version.created_at),
    }


def rollback_to_version(db: Session, form_spec_id: int, version_id: int) -> dict:
    """Restore a FormSpec's items from a version snapshot.

    1. Snapshot current state (source="rollback")
    2. Delete current items
    3. Recreate items from target version's snapshot
    """
    target_version = db.query(SpecVersion).get(version_id)
    if not target_version:
        return {"error": "Version not found"}
    if target_version.form_spec_id != form_spec_id:
        return {"error": "Version does not belong to this spec"}

    # Snapshot current state before rollback
    create_version_snapshot(db, form_spec_id, source="rollback")

    # Delete current items
    db.query(SpecItem).filter(SpecItem.form_spec_id == form_spec_id).delete()

    # Recreate from snapshot
    for i, item_data in enumerate(target_version.items_snapshot):
        item = SpecItem(
            form_spec_id=form_spec_id,
            item_name=item_data["item_name"],
            spec_type=item_data["spec_type"],
            min_value=item_data.get("min_value"),
            max_value=item_data.get("max_value"),
            expected_text=item_data.get("expected_text"),
            threshold_value=item_data.get("threshold_value"),
            threshold_operator=item_data.get("threshold_operator"),
            display_order=item_data.get("display_order", i),
            group_name=item_data.get("group_name"),
            sub_group=item_data.get("sub_group"),
        )
        db.add(item)

    db.flush()
    logger.info(
        f"Rolled back spec {form_spec_id} to version {target_version.version_number} "
        f"({len(target_version.items_snapshot)} items)"
    )
    return {
        "success": True,
        "restored_version": target_version.version_number,
        "item_count": len(target_version.items_snapshot),
    }
