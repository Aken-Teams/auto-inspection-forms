"""Parser for F-QA1021 离子消散设备点检记录表."""
import re
from parsers.base import BaseParser


class QA1021Parser(BaseParser):
    form_code = "F-QA1021"

    # Header structure based on analysis:
    # Row 5: 设备编号 | 日期 | √离子风扇 items... | 离子消除器 items... | 点检人员 | 领班确认
    # Row 6: column headers
    # Row 7: expected values (spec descriptions)
    # Row 8+: data rows

    ITEMS = [
        {"key": "power_switch", "label": "电源开关", "group": "离子风扇", "col_offset": 0},
        {"key": "fan_ribbon", "label": "风扇飘带", "group": "离子风扇", "col_offset": 1},
        {"key": "air_filter", "label": "空气滤网", "group": "离子风扇", "col_offset": 2},
        {"key": "fan_angle", "label": "风扇角度", "group": "离子风扇", "col_offset": 3},
        {"key": "fan_speed", "label": "风扇风速", "group": "离子风扇", "col_offset": 4},
    ]

    def _parse_impl(self, ws, sheet_name):
        # Non-greedy match to separate equipment ID from year (e.g., RD-LZ-142026年 → RD-LZ-14)
        equipment_match = re.match(r"(RD-LZ-\d+?)(\d{4}年)", sheet_name)
        if not equipment_match:
            equipment_match = re.match(r"(RD-LZ-\d+)", sheet_name)
        equipment_id = equipment_match.group(1) if equipment_match else sheet_name

        # Find header row (look for "设备编号")
        header_row = self._find_row_with_text(ws, "设备编号")
        if not header_row:
            header_row = 5

        # Find data start row and column layout
        sub_header_row = header_row + 1  # column names
        data_start_row = header_row + 3  # data starts 3 rows after header

        # Detect column positions from sub_header_row
        col_map = {}
        for col in range(1, ws.max_column + 1):
            val = self._cell_val(ws, sub_header_row, col)
            if val:
                col_map[str(val)] = col

        # Map item columns
        check_cols = {}
        check_labels = ["电源开关", "风扇飘带", "空气滤网", "风扇角度", "风扇风速"]
        for label in check_labels:
            if label in col_map:
                check_cols[label] = col_map[label]

        # Also try to find 离子消除器 items
        ion_labels = ["指示灯(PWR)", "指示灯(ION)", "指示灯(NDL)"]
        for label in ion_labels:
            if label in col_map:
                check_cols[label] = col_map[label]

        # Find equipment, date, inspector, supervisor columns
        equip_col = col_map.get("设备编号") or 1
        date_col = col_map.get("日期") or 3
        inspector_col = col_map.get("点检人员")
        supervisor_col = col_map.get("领班确认")

        # Determine the date range from sheet name
        date_match = re.search(r"(\d{4})年(\d{2})月", sheet_name)
        inspection_date = f"{date_match.group(1)}/{date_match.group(2)}" if date_match else ""

        headers = [{"key": label, "label": label, "group": "点检项目"} for label in check_cols.keys()]

        rows = []
        meta_rows = []
        for row in range(data_start_row, ws.max_row + 1):
            equip_val = self._cell_val(ws, row, equip_col if isinstance(equip_col, int) else 1)
            date_val = self._cell_val(ws, row, date_col if isinstance(date_col, int) else 3)

            if not equip_val and not date_val:
                continue
            # Skip summary/note rows
            if equip_val and ("备注" in str(equip_val) or "REV" in str(equip_val)):
                break

            values = {}
            cells = {}
            for label, col in check_cols.items():
                values[label] = self._cell_val(ws, row, col)
                cells[label] = [row, col]

            rows.append({
                "date": str(date_val) if date_val else "",
                "time": "",
                "values": values,
                "extra": {
                    "equipment_id": str(equip_val) if equip_val else "",
                    "inspector": str(self._cell_val(ws, row, inspector_col) or "") if inspector_col else "",
                    "supervisor": str(self._cell_val(ws, row, supervisor_col) or "") if supervisor_col else "",
                },
            })
            meta_rows.append({"row": row, "cells": cells})

        return {
            "equipment_id": equipment_id,
            "inspection_date": inspection_date,
            "headers": headers,
            "rows": rows,
            "meta": {"row_map": meta_rows, "judgment_col": None},
        }
