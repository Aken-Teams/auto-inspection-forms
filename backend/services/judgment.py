"""Judgment engine: compare raw data against specs and produce OK/NG results."""
from sqlalchemy.orm import Session
from models import FormSpec, SpecItem, FormType
from utils.spec_parser import judge_value


def judge_sheet_data(db: Session, form_code: str, equipment_id: str, parsed_data: dict) -> dict:
    """Judge parsed sheet data against stored specs.

    Args:
        db: Database session
        form_code: Form type code (e.g., 'F-RD09AJ')
        equipment_id: Equipment/machine ID
        parsed_data: Output from a parser's parse_sheet()

    Returns:
        {
            "has_spec": bool,
            "form_spec_id": int or None,
            "overall_result": "OK" | "NG" | "NO_SPEC",
            "judged_rows": [
                {
                    "date": str,
                    "time": str,
                    "values": {key: {"raw": value, "judgment": "OK"|"NG"|"SKIP", "spec": str}},
                    "extra": dict
                }
            ],
            "summary": {"total": int, "ok": int, "ng": int, "skip": int}
        }
    """
    form_type = db.query(FormType).filter(FormType.form_code == form_code).first()
    if not form_type:
        return _no_spec_result(parsed_data)

    # F-RD09AB: per-row spec lookup (each row has different wash_reason/wash_method)
    if form_code == "F-RD09AB":
        return _judge_rd09ab(db, form_type.id, equipment_id, parsed_data, form_code)

    # Find matching spec
    form_spec = _find_matching_spec(db, form_type.id, equipment_id, form_code, parsed_data)
    if not form_spec:
        return _no_spec_result(parsed_data)

    # Load spec items
    spec_items = db.query(SpecItem).filter(SpecItem.form_spec_id == form_spec.id).order_by(SpecItem.display_order).all()
    if not spec_items:
        return _no_spec_result(parsed_data)

    # Build spec lookup by item_name (and sub_group for items with same name)
    spec_lookup = {}
    spec_lookup_by_subgroup = {}  # (item_name, sub_group) -> SpecItem
    for item in spec_items:
        spec_lookup[item.item_name] = item
        if item.sub_group:
            spec_lookup_by_subgroup[(item.item_name, item.sub_group)] = item

    # Build col_key -> header label mapping for GenericParser support
    col_label_map = _build_col_label_map(parsed_data)

    # Judge each row
    judged_rows = []
    total_judgments = 0
    ok_count = 0
    ng_count = 0
    skip_count = 0
    has_ng = False

    for row_data in parsed_data.get("rows", []):
        judged_values = {}
        for key, raw_value in row_data.get("values", {}).items():
            # Find matching spec item
            spec_item = _find_spec_for_key(spec_lookup, spec_lookup_by_subgroup, key, row_data, form_code, col_label_map)

            if spec_item:
                result = judge_value(
                    raw_value,
                    spec_item.spec_type,
                    min_value=spec_item.min_value,
                    max_value=spec_item.max_value,
                    expected_text=spec_item.expected_text,
                    threshold_value=spec_item.threshold_value,
                    threshold_operator=spec_item.threshold_operator,
                )
                spec_display = _format_spec_display(spec_item)
                total_judgments += 1
                if result == "OK":
                    ok_count += 1
                elif result == "NG":
                    ng_count += 1
                    has_ng = True
                else:
                    skip_count += 1
            else:
                result = "SKIP"
                spec_display = ""
                skip_count += 1

            judged_values[key] = {
                "raw": raw_value,
                "judgment": result,
                "spec": spec_display,
            }

        judged_rows.append({
            "date": row_data.get("date", ""),
            "time": row_data.get("time", ""),
            "values": judged_values,
            "extra": row_data.get("extra", {}),
        })

    return {
        "has_spec": True,
        "form_spec_id": form_spec.id,
        "overall_result": "NG" if has_ng else "OK",
        "judged_rows": judged_rows,
        "summary": {
            "total": total_judgments,
            "ok": ok_count,
            "ng": ng_count,
            "skip": skip_count,
        },
        "meta": parsed_data.get("meta"),
    }


def _judge_rd09ab(db: Session, form_type_id: int, equipment_id: str,
                  parsed_data: dict, form_code: str) -> dict:
    """Special judgment for F-RD09AB: per-row spec lookup by wash_reason + wash_method."""
    # Pre-load all specs for this machine to avoid repeated DB queries
    all_specs = db.query(FormSpec).filter(
        FormSpec.form_type_id == form_type_id,
        FormSpec.equipment_id.like(f"{equipment_id}_%"),
    ).all()

    if not all_specs:
        return _no_spec_result(parsed_data)

    # Build cache: spec_key -> {spec, items, lookup}
    spec_cache = {}
    for spec in all_specs:
        items = db.query(SpecItem).filter(SpecItem.form_spec_id == spec.id).order_by(SpecItem.display_order).all()
        lookup = {}
        for item in items:
            lookup[item.item_name] = item
        spec_cache[spec.equipment_id] = {"spec": spec, "items": items, "lookup": lookup}

    judged_rows = []
    total_judgments = 0
    ok_count = 0
    ng_count = 0
    skip_count = 0
    has_ng = False
    first_spec_id = all_specs[0].id

    for row_data in parsed_data.get("rows", []):
        values = row_data.get("values", {})
        wash_reason = values.get("wash_reason", "")
        wash_method = values.get("wash_method", "")

        # Build spec key for this row
        spec_key = f"{equipment_id}_{wash_reason}_{wash_method}"
        row_spec = spec_cache.get(spec_key)

        # Fallback: try without wash_method, or just machine_id
        if not row_spec and wash_reason:
            for key, cached in spec_cache.items():
                if key.startswith(f"{equipment_id}_{wash_reason}"):
                    row_spec = cached
                    break

        judged_values = {}
        for key, raw_value in values.items():
            if row_spec:
                spec_item = _find_spec_for_key(row_spec["lookup"], {}, key, row_data, form_code)
            else:
                spec_item = None

            if spec_item:
                result = judge_value(
                    raw_value,
                    spec_item.spec_type,
                    min_value=spec_item.min_value,
                    max_value=spec_item.max_value,
                    expected_text=spec_item.expected_text,
                    threshold_value=spec_item.threshold_value,
                    threshold_operator=spec_item.threshold_operator,
                )
                spec_display = _format_spec_display(spec_item)
                total_judgments += 1
                if result == "OK":
                    ok_count += 1
                elif result == "NG":
                    ng_count += 1
                    has_ng = True
                else:
                    skip_count += 1
            else:
                result = "SKIP"
                spec_display = ""
                skip_count += 1

            judged_values[key] = {
                "raw": raw_value,
                "judgment": result,
                "spec": spec_display,
            }

        judged_rows.append({
            "date": row_data.get("date", ""),
            "time": row_data.get("time", ""),
            "values": judged_values,
            "extra": row_data.get("extra", {}),
        })

    return {
        "has_spec": True,
        "form_spec_id": first_spec_id,
        "overall_result": "NG" if has_ng else "OK",
        "judged_rows": judged_rows,
        "summary": {
            "total": total_judgments,
            "ok": ok_count,
            "ng": ng_count,
            "skip": skip_count,
        },
        "meta": parsed_data.get("meta"),
    }


def _find_matching_spec(db: Session, form_type_id: int, equipment_id: str,
                        form_code: str, parsed_data: dict) -> FormSpec | None:
    """Find the matching FormSpec for an equipment ID."""
    # Direct match
    spec = db.query(FormSpec).filter(
        FormSpec.form_type_id == form_type_id,
        FormSpec.equipment_id == equipment_id,
    ).first()
    if spec:
        return spec

    # For F-QA1021: all equipment uses the universal RD-LZ-XX spec
    if form_code == "F-QA1021":
        return db.query(FormSpec).filter(
            FormSpec.form_type_id == form_type_id,
            FormSpec.equipment_id == "RD-LZ-XX",
        ).first()

    # For F-RD09AA: try wildcard WPRN-XXXX (all machines share same spec)
    if form_code == "F-RD09AA":
        return db.query(FormSpec).filter(
            FormSpec.form_type_id == form_type_id,
            FormSpec.equipment_id == "WPRN-XXXX",
        ).first()

    # For F-RD09AJ: try wildcard WCBA-XXXX
    if form_code == "F-RD09AJ":
        return db.query(FormSpec).filter(
            FormSpec.form_type_id == form_type_id,
            FormSpec.equipment_id == "WCBA-XXXX",
        ).first()

    # For F-RD09AK: try to match by machine_id + package
    if form_code == "F-RD09AK":
        package = parsed_data.get("extra", {}).get("package", "")
        if package:
            spec_key = f"{equipment_id}_{package}"
            spec = db.query(FormSpec).filter(
                FormSpec.form_type_id == form_type_id,
                FormSpec.equipment_id == spec_key,
            ).first()
            if spec:
                return spec

    return None


def _build_col_label_map(parsed_data: dict) -> dict:
    """Build a mapping from col_N keys to header labels for GenericParser data."""
    col_map = {}
    for h in parsed_data.get("headers", []):
        if h.get("key", "").startswith("col_") and h.get("label"):
            col_map[h["key"]] = h["label"]
    return col_map


def _find_spec_for_key(spec_lookup: dict, spec_lookup_by_subgroup: dict,
                       key: str, row_data: dict, form_code: str,
                       col_label_map: dict | None = None) -> SpecItem | None:
    """Find the matching SpecItem for a parsed value key."""
    # GenericParser col_N keys: map to header label and look up by label
    if key.startswith("col_") and col_label_map:
        label = col_label_map.get(key)
        if label and label in spec_lookup:
            return spec_lookup[label]
        # Try partial/normalized matching (strip whitespace, case-insensitive)
        if label:
            label_norm = label.strip().lower()
            for item_name, item in spec_lookup.items():
                if item_name.strip().lower() == label_norm:
                    return item
        return None

    # Try sub_group-based matching first for F-RD09AK
    if form_code == "F-RD09AK":
        part = row_data.get("values", {}).get("part") or row_data.get("extra", {}).get("part", "")
        if part:
            subgroup_key = (key, str(part))
            if subgroup_key in spec_lookup_by_subgroup:
                return spec_lookup_by_subgroup[subgroup_key]

    # Direct match (only for non-ambiguous items)
    if key in spec_lookup:
        item = spec_lookup[key]
        # Skip direct match if item has sub_groups (ambiguous)
        if not item.sub_group or form_code != "F-RD09AK":
            return item

    # Label-based matching
    label_map = {
        "clamp_pressure": "合模压力(ton)",
        "inject_pressure": "注塑压强(kgf/cm²)",
        "cure_time": "固化时间(sec)",
        "inject_time": "注塑时间(sec)",
        "preheat_temp": "预热台温度(℃)",
        "cooling_water": "冷却水流量LPM",
        "mold_status": "模具状态",
        "pin_status": "定位针状态",
    }

    mapped = label_map.get(key)
    if mapped and mapped in spec_lookup:
        return spec_lookup[mapped]

    # Temperature display keys: set_temp_上模, disp_temp_上模_1
    if key.startswith("set_temp_"):
        pos = key.replace("set_temp_", "")
        lookup_key = f"模温设定值({pos})"
        if lookup_key in spec_lookup:
            return spec_lookup[lookup_key]

    if key.startswith("disp_temp_"):
        parts = key.replace("disp_temp_", "").split("_")
        if len(parts) == 2:
            pos, num = parts
            lookup_key = f"模温显示值{num}({pos})"
            if lookup_key in spec_lookup:
                return spec_lookup[lookup_key]

    # SV/PV temperature keys for F-RD09AJ
    if key.startswith("sv_") or key.startswith("pv_"):
        prefix = "温区"
        zone = key.split("_")[1]
        if key.startswith("sv_"):
            lookup_key = f"温区{zone}设定SV(℃)"
        else:
            lookup_key = f"温区{zone}实际PV(℃)"
        if lookup_key in spec_lookup:
            return spec_lookup[lookup_key]

    # Gas keys
    if key.startswith("gas_"):
        gas_name = key.replace("gas_", "")
        if gas_name in spec_lookup:
            return spec_lookup[gas_name]

    # Check items for F-QA1021
    check_items = ["电源开关", "风扇飘带", "空气滤网", "风扇角度", "风扇风速"]
    if key in check_items and key in spec_lookup:
        return spec_lookup[key]

    return None


def _format_spec_display(spec_item: SpecItem) -> str:
    """Format spec item for display."""
    if spec_item.spec_type == "range":
        return f"{spec_item.min_value}~{spec_item.max_value}"
    elif spec_item.spec_type == "check":
        return spec_item.expected_text or "√"
    elif spec_item.spec_type == "text":
        return spec_item.expected_text or ""
    elif spec_item.spec_type == "threshold":
        return f"{spec_item.threshold_operator}{spec_item.threshold_value}"
    return ""


def _no_spec_result(parsed_data: dict) -> dict:
    """Return a NO_SPEC result with raw data preserved."""
    judged_rows = []
    for row_data in parsed_data.get("rows", []):
        judged_values = {}
        for key, raw_value in row_data.get("values", {}).items():
            judged_values[key] = {
                "raw": raw_value,
                "judgment": "NO_SPEC",
                "spec": "",
            }
        judged_rows.append({
            "date": row_data.get("date", ""),
            "time": row_data.get("time", ""),
            "values": judged_values,
            "extra": row_data.get("extra", {}),
        })

    return {
        "has_spec": False,
        "form_spec_id": None,
        "overall_result": "NO_SPEC",
        "judged_rows": judged_rows,
        "summary": {"total": 0, "ok": 0, "ng": 0, "skip": 0},
        "meta": parsed_data.get("meta"),
    }
