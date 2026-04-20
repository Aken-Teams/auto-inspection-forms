"""Targeted test: verify col_N -> header label -> SpecItem matching works at value level."""
import sys
sys.stdout.reconfigure(encoding='utf-8')

import httpx
import json

BASE = "http://localhost:8000"
client = httpx.Client(base_url=BASE, timeout=30)


def test_col_label_matching():
    """Create a known form type, spec with specific item names, and simulate GenericParser output."""
    form_code = "F-TEST01"

    # Ensure form type exists
    resp = client.get("/api/specs/form-types")
    codes = [ft["form_code"] for ft in resp.json()]
    if form_code not in codes:
        client.post("/api/specs/form-types", json={
            "form_code": form_code,
            "form_name": "Test Form",
            "file_pattern": "F-TEST01",
        })
        print(f"Created form type: {form_code}")

    # Create spec group with items named to match GenericParser headers
    resp = client.post(f"/api/specs/form-types/{form_code}/specs", json={
        "equipment_id": "TEST-EQUIP-001",
        "equipment_name": "Test Equipment",
    })
    spec = resp.json()
    spec_id = spec.get("id")
    print(f"Created spec group: id={spec_id}")

    # Add spec items with names that should match col headers
    items = [
        {"item_name": "温度", "spec_type": "range", "min_value": 20.0, "max_value": 30.0},
        {"item_name": "压力", "spec_type": "range", "min_value": 1.0, "max_value": 5.0},
        {"item_name": "状态", "spec_type": "text", "expected_text": "正常"},
    ]
    resp = client.put(f"/api/specs/specs/{spec_id}", json={"items": items})
    print(f"Updated spec with {len(items)} items: {resp.status_code}")

    # Now call judgment directly
    from services.judgment import judge_sheet_data
    from database import SessionLocal

    db = SessionLocal()
    try:
        # Simulate GenericParser output with col_N keys
        parsed_data = {
            "equipment_id": "TEST-EQUIP-001",
            "inspection_date": "2026-04-20",
            "headers": [
                {"key": "col_1", "label": "日期", "group": "data"},
                {"key": "col_2", "label": "温度", "group": "data"},
                {"key": "col_3", "label": "压力", "group": "data"},
                {"key": "col_4", "label": "状态", "group": "data"},
                {"key": "col_5", "label": "备注", "group": "data"},
            ],
            "rows": [
                {
                    "date": "2026-04-20",
                    "time": "08:00",
                    "values": {
                        "col_1": "2026-04-20",
                        "col_2": 25.0,      # In range [20, 30] -> OK
                        "col_3": 3.0,       # In range [1, 5] -> OK
                        "col_4": "正常",     # Matches expected -> OK
                        "col_5": "无",
                    },
                    "extra": {},
                },
                {
                    "date": "2026-04-20",
                    "time": "14:00",
                    "values": {
                        "col_1": "2026-04-20",
                        "col_2": 35.0,      # Out of range -> NG
                        "col_3": 2.5,       # In range -> OK
                        "col_4": "异常",     # Does not match -> NG
                        "col_5": "温度偏高",
                    },
                    "extra": {},
                },
            ],
        }

        result = judge_sheet_data(db, form_code, "TEST-EQUIP-001", parsed_data)

        print(f"\nJudgment result:")
        print(f"  has_spec: {result['has_spec']}")
        print(f"  overall_result: {result['overall_result']}")
        print(f"  summary: {result['summary']}")

        for i, row in enumerate(result["judged_rows"]):
            print(f"\n  Row {i+1} ({row['date']} {row['time']}):")
            for key, val in row["values"].items():
                header = {"col_1": "日期", "col_2": "温度", "col_3": "压力", "col_4": "状态", "col_5": "备注"}.get(key, key)
                print(f"    {key} ({header}): raw={val['raw']} -> {val['judgment']} (spec: {val['spec']})")

        # Verify expectations
        errors = []
        row1 = result["judged_rows"][0]["values"]
        row2 = result["judged_rows"][1]["values"]

        # Row 1: all within spec
        if row1["col_2"]["judgment"] != "OK":
            errors.append(f"Row1 col_2 (温度=25): expected OK, got {row1['col_2']['judgment']}")
        if row1["col_3"]["judgment"] != "OK":
            errors.append(f"Row1 col_3 (压力=3): expected OK, got {row1['col_3']['judgment']}")
        if row1["col_4"]["judgment"] != "OK":
            errors.append(f"Row1 col_4 (状态=正常): expected OK, got {row1['col_4']['judgment']}")

        # Row 2: 温度 NG, 压力 OK, 状态 NG
        if row2["col_2"]["judgment"] != "NG":
            errors.append(f"Row2 col_2 (温度=35): expected NG, got {row2['col_2']['judgment']}")
        if row2["col_3"]["judgment"] != "OK":
            errors.append(f"Row2 col_3 (压力=2.5): expected OK, got {row2['col_3']['judgment']}")
        if row2["col_4"]["judgment"] != "NG":
            errors.append(f"Row2 col_4 (状态=异常): expected NG, got {row2['col_4']['judgment']}")

        # Unmatched columns should be SKIP
        if row1["col_1"]["judgment"] != "SKIP":
            errors.append(f"Row1 col_1 (日期): expected SKIP, got {row1['col_1']['judgment']}")
        if row1["col_5"]["judgment"] != "SKIP":
            errors.append(f"Row1 col_5 (备注): expected SKIP, got {row1['col_5']['judgment']}")

        # Overall should be NG
        if result["overall_result"] != "NG":
            errors.append(f"Overall: expected NG, got {result['overall_result']}")

        if errors:
            print(f"\n  ERRORS:")
            for e in errors:
                print(f"    {e}")
            print(f"\n  [FAIL] {len(errors)} assertions failed")
        else:
            print(f"\n  [PASS] All assertions passed!")
            print(f"    - col_N -> header label mapping works")
            print(f"    - Range judgment (温度, 压力) works")
            print(f"    - Check/text judgment (状态) works")
            print(f"    - Unmatched columns (日期, 备注) correctly SKIP")
            print(f"    - Overall NG correctly detected")

    finally:
        db.close()

    # Cleanup: delete the test form type
    client.delete(f"/api/specs/form-types/{form_code}")
    print(f"\nCleaned up test form type: {form_code}")


if __name__ == "__main__":
    test_col_label_matching()
