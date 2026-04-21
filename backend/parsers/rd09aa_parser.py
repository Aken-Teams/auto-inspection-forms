"""Parser for F-RD09AA Auto Mold 机台检查记录表."""
import re
from parsers.base import BaseParser


class RD09AAParser(BaseParser):
    form_code = "F-RD09AA"

    # Structure:
    # Row ~4: 机台：WPRN-0001
    # Row 5: headers (日期, 时间, 产品种类, 模具号, 合模压力, 注塑压强, 固化时间, 注塑时间, 预热台温度, 上/下模温)
    # Row 6: sub-header (区分, 设定值, 显示值)
    # Row 7: sub-sub-header (1, 2, 3, 4)
    # Row 8+: data (every 2 rows = 1 record: 上模 + 下模)

    def _parse_impl(self, ws, sheet_name):
        equipment_id = sheet_name  # e.g., WPRN-0001

        # Find the machine label row
        machine_row = None
        for row in range(1, 10):
            for col in range(1, ws.max_column + 1):
                val = self._cell_val(ws, row, col)
                if val and "机台" in str(val) and equipment_id in str(val):
                    machine_row = row
                    break
            if machine_row:
                break

        # Find header row (look for "日期")
        header_row = self._find_row_with_text(ws, "日期")
        if not header_row:
            header_row = 5

        # Map columns from header
        col_map = {}
        for col in range(1, ws.max_column + 1):
            val = self._cell_val(ws, header_row, col)
            if val:
                col_map[str(val).strip()] = col

        date_col = col_map.get("日期", 3)
        time_col = col_map.get("时间", 5)
        product_col = col_map.get("产品种类", 7)
        mold_col = col_map.get("模具号", 9)
        clamp_col = col_map.get("合模压力(ton)", 10)
        inject_col = col_map.get("注塑压强(kgf/cm²)", 12)
        cure_col = col_map.get("固化时间(sec)", 14)
        inject_time_col = col_map.get("注塑时间(sec)", 15)
        preheat_col = col_map.get("预热台温度(℃)", 17)

        # Find "区分" and "设定值" and "显示值" columns
        sub_header_row = header_row + 1
        div_col = set_col = disp_col = None
        for col in range(1, ws.max_column + 1):
            val = self._cell_val(ws, sub_header_row, col)
            if val == "区分":
                div_col = col
            elif val == "设定值":
                set_col = col
            elif val == "显示值":
                disp_col = col

        # Display value sub-columns (1,2,3,4) are in row header_row+2
        disp_cols = []
        if disp_col:
            sub_sub_row = header_row + 2
            for col in range(disp_col, ws.max_column + 1):
                val = self._cell_val(ws, sub_sub_row, col)
                if val and str(val).isdigit():
                    disp_cols.append(col)
                if len(disp_cols) >= 4:
                    break

        # Data starts after sub-sub-header
        data_start = header_row + 3

        headers = [
            {"key": "product_type", "label": "产品种类", "group": "基本"},
            {"key": "mold_no", "label": "模具号", "group": "基本"},
            {"key": "clamp_pressure", "label": "合模压力(ton)", "group": "参数"},
            {"key": "inject_pressure", "label": "注塑压强(kgf/cm²)", "group": "参数"},
            {"key": "cure_time", "label": "固化时间(sec)", "group": "参数"},
            {"key": "inject_time", "label": "注塑时间(sec)", "group": "参数"},
            {"key": "preheat_temp", "label": "预热台温度(℃)", "group": "参数"},
        ]
        # Add temperature display columns
        for pos in ["上模", "下模"]:
            headers.append({"key": f"set_temp_{pos}", "label": f"模温设定值({pos})", "group": "模温"})
            for i in range(1, 5):
                headers.append({"key": f"disp_temp_{pos}_{i}", "label": f"模温显示值{i}({pos})", "group": "模温"})

        rows = []
        meta_rows = []
        row = data_start
        while row <= ws.max_row:
            date_val = self._cell_val(ws, row, date_col)
            product_val = self._cell_val(ws, row, product_col)

            if not product_val and not date_val:
                # Check if it's an upper/lower mold continuation
                div_val = self._cell_val(ws, row, div_col) if div_col else None
                if not div_val:
                    row += 1
                    continue

            # Check for end markers
            first_col_val = self._cell_val(ws, row, 1)
            if first_col_val and ("备注" in str(first_col_val) or "REV" in str(first_col_val)):
                break

            div_val = self._cell_val(ws, row, div_col) if div_col else None

            if div_val and str(div_val).strip() in ("上模", "下模"):
                # This is a mold temp row
                pos = str(div_val).strip()
                set_val = self._cell_val(ws, row, set_col) if set_col else None

                values = {
                    "date": str(date_val) if date_val else "",
                    "time": str(self._cell_val(ws, row, time_col) or ""),
                    "product_type": str(product_val) if product_val else "",
                    "mold_no": str(self._cell_val(ws, row, mold_col) or ""),
                    "clamp_pressure": self._cell_val(ws, row, clamp_col),
                    "inject_pressure": self._cell_val(ws, row, inject_col),
                    "cure_time": self._cell_val(ws, row, cure_col),
                    "inject_time": self._cell_val(ws, row, inject_time_col),
                    "preheat_temp": self._cell_val(ws, row, preheat_col),
                    f"set_temp_{pos}": set_val,
                }
                cells = {
                    "product_type": [row, product_col],
                    "mold_no": [row, mold_col],
                    "clamp_pressure": [row, clamp_col],
                    "inject_pressure": [row, inject_col],
                    "cure_time": [row, cure_col],
                    "inject_time": [row, inject_time_col],
                    "preheat_temp": [row, preheat_col],
                }
                if set_col:
                    cells[f"set_temp_{pos}"] = [row, set_col]
                for i, dc in enumerate(disp_cols):
                    values[f"disp_temp_{pos}_{i+1}"] = self._cell_val(ws, row, dc)
                    cells[f"disp_temp_{pos}_{i+1}"] = [row, dc]

                # Check next row for the other mold position
                if row + 1 <= ws.max_row:
                    next_div = self._cell_val(ws, row + 1, div_col) if div_col else None
                    if next_div and str(next_div).strip() in ("上模", "下模"):
                        next_pos = str(next_div).strip()
                        next_set = self._cell_val(ws, row + 1, set_col) if set_col else None
                        values[f"set_temp_{next_pos}"] = next_set
                        if set_col:
                            cells[f"set_temp_{next_pos}"] = [row + 1, set_col]
                        for i, dc in enumerate(disp_cols):
                            values[f"disp_temp_{next_pos}_{i+1}"] = self._cell_val(ws, row + 1, dc)
                            cells[f"disp_temp_{next_pos}_{i+1}"] = [row + 1, dc]
                        row += 1  # skip next row as we merged it

                signer = self._cell_val(ws, row, ws.max_column - 1)
                rows.append({
                    "date": values.pop("date"),
                    "time": values.pop("time"),
                    "values": values,
                    "extra": {"signer": str(signer) if signer else ""},
                })
                meta_rows.append({"row": row, "cells": cells})

            row += 1

        # Detect inspection date from sheet content
        date_row = self._find_row_with_text(ws, "年")
        inspection_date = ""
        if date_row:
            for col in range(1, 10):
                val = self._cell_val(ws, date_row, col)
                if val and "年" in str(val):
                    inspection_date = str(val).strip()
                    break

        return {
            "equipment_id": equipment_id,
            "inspection_date": inspection_date,
            "headers": headers,
            "rows": rows,
            "meta": {"row_map": meta_rows, "judgment_col": None},
        }
