"""Parser for F-RD09AJ RO焊接炉检查记录表."""
import re
from parsers.base import BaseParser


class RD09AJParser(BaseParser):
    form_code = "F-RD09AJ"

    # Structure:
    # Row 6: 焊接炉编号：WCBA-0001 ... 2026年04月
    # Row 7: headers (日期/班别, 时间, 温度设定SV℃, 实际温度SV±5℃, 氮气, 冷却水, 判定, 签名)
    # Row 8: sub-header (温, 区, PRE COOL GAS, etc.)
    # Row 9: zone numbers (1-8, 1-8, gas columns)
    # Row 10+: data rows

    def _parse_impl(self, ws, sheet_name):
        equipment_id = sheet_name  # e.g., WCBA-0001

        # Find the equipment label row
        equip_row = None
        for row in range(1, 10):
            for col in range(1, ws.max_column + 1):
                val = self._cell_val(ws, row, col)
                if val and "焊接炉编号" in str(val):
                    equip_row = row
                    break
            if equip_row:
                break

        if not equip_row:
            equip_row = 6

        # Get inspection date from the same row
        inspection_date = ""
        for col in range(ws.max_column, 0, -1):
            val = self._cell_val(ws, equip_row, col)
            if val and "年" in str(val):
                inspection_date = str(val).strip()
                break

        # Find header row
        header_row = self._find_row_with_text(ws, "日期")
        if not header_row:
            header_row = equip_row + 1

        # Map main header columns
        col_map = {}
        for col in range(1, ws.max_column + 1):
            val = self._cell_val(ws, header_row, col)
            if val:
                col_map[str(val).replace("\n", "")] = col

        date_col = 2  # B column
        time_col = 4  # D column
        judge_col = None
        sign_col = None

        for label, col in col_map.items():
            if "日期" in label or "班别" in label:
                date_col = col
            elif "时间" in label:
                time_col = col
            elif "判定" in label:
                judge_col = col
            elif "签名" in label:
                sign_col = col

        # Find zone number row (row with 1,2,3,4,5,6,7,8)
        zone_row = header_row + 2
        sv_start = None
        pv_start = None
        gas_cols = []

        # Find SV columns (温度设定)
        for col in range(1, ws.max_column + 1):
            val = self._cell_val(ws, header_row, col)
            if val and "温度设定" in str(val):
                sv_start = col
            elif val and "实际温度" in str(val):
                pv_start = col
            elif val and "氮气" in str(val):
                # Gas columns start here
                gas_start = col

        # Read zone numbers from zone_row to map columns
        sv_cols = []
        pv_cols = []
        if sv_start and pv_start:
            for col in range(sv_start, pv_start):
                val = self._cell_val(ws, zone_row, col)
                if val and str(val).strip().isdigit():
                    sv_cols.append((int(str(val).strip()), col))
            for col in range(pv_start, ws.max_column + 1):
                val = self._cell_val(ws, zone_row, col)
                if val and str(val).strip().isdigit():
                    pv_cols.append((int(str(val).strip()), col))
                if len(pv_cols) >= 8:
                    break

        # Find gas columns from sub-header row
        gas_header_row = header_row + 1
        gas_labels = []
        gas_col_start = None
        for col in range(1, ws.max_column + 1):
            val = self._cell_val(ws, gas_header_row, col)
            if val and ("GAS" in str(val).upper() or "SHIELD" in str(val).upper() or "COOL" in str(val).upper()):
                if gas_col_start is None:
                    gas_col_start = col
                gas_labels.append({"label": str(val).strip(), "col": col})

        # Find cooling water and judgment columns
        cooling_col = None
        for label, col in col_map.items():
            if "冷却水" in label:
                cooling_col = col

        # Build headers
        headers = []
        for zone_num, _ in sv_cols:
            headers.append({"key": f"sv_{zone_num}", "label": f"温区{zone_num}设定SV(℃)", "group": "温度设定"})
        for zone_num, _ in pv_cols:
            headers.append({"key": f"pv_{zone_num}", "label": f"温区{zone_num}实际PV(℃)", "group": "实际温度"})
        for gl in gas_labels:
            headers.append({"key": f"gas_{gl['label']}", "label": gl["label"], "group": "氮气"})
        headers.append({"key": "cooling_water", "label": "冷却水流量LPM", "group": "冷却水"})
        headers.append({"key": "judgment", "label": "判定", "group": "判定"})

        # Parse data rows
        data_start = zone_row + 1
        rows = []
        meta_rows = []

        for row in range(data_start, ws.max_row + 1):
            date_val = self._cell_val(ws, row, date_col)
            if not date_val:
                continue
            date_str = str(date_val).strip()
            if "备注" in date_str or "REV" in date_str:
                break

            time_val = self._cell_val(ws, row, time_col)
            values = {}
            cells = {}

            # SV temperatures
            for zone_num, col in sv_cols:
                values[f"sv_{zone_num}"] = self._cell_val(ws, row, col)
                cells[f"sv_{zone_num}"] = [row, col]
            # PV temperatures
            for zone_num, col in pv_cols:
                values[f"pv_{zone_num}"] = self._cell_val(ws, row, col)
                cells[f"pv_{zone_num}"] = [row, col]
            # Gas values
            for gl in gas_labels:
                values[f"gas_{gl['label']}"] = self._cell_val(ws, row, gl["col"])
                cells[f"gas_{gl['label']}"] = [row, gl["col"]]
            # Cooling water
            if cooling_col:
                values["cooling_water"] = self._cell_val(ws, row, cooling_col)
                cells["cooling_water"] = [row, cooling_col]
            # Judgment
            if judge_col:
                values["judgment"] = self._cell_val(ws, row, judge_col)
                cells["judgment"] = [row, judge_col]

            signer = self._cell_val(ws, row, sign_col) if sign_col else ""

            rows.append({
                "date": date_str,
                "time": str(time_val) if time_val else "",
                "values": values,
                "extra": {"signer": str(signer) if signer else ""},
            })
            meta_rows.append({"row": row, "cells": cells})

        return {
            "equipment_id": equipment_id,
            "inspection_date": inspection_date,
            "headers": headers,
            "rows": rows,
            "meta": {"row_map": meta_rows, "judgment_col": judge_col},
        }
