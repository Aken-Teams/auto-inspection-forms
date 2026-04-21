"""Parser for F-RD09AB Auto Mold 洗模检查记录表."""
import re
from parsers.base import BaseParser


class RD09ABParser(BaseParser):
    form_code = "F-RD09AB"

    # Structure:
    # Row 4: 机台：WPRN-0001
    # Row 6: headers (日期, 时间/班别, 洗模原因, 洗模方式, 模数, 固化时间, 模具号, 合模压力, 注塑压强, 上/下模温, 洗模外观, 模具状态, 定位针状态, 签名, 备注)
    # Row 7: sub-header (区分, 设定值, 显示值)
    # Row 8: sub-sub (1,2,3,4 | 1st,2nd,3th,4th,5th)
    # Row 9+: data (grouped by wash session, 上模+下模 per mold)

    def _parse_impl(self, ws, sheet_name):
        equipment_id = sheet_name

        # Find header row
        header_row = self._find_row_with_text(ws, "日期")
        if not header_row:
            header_row = 6

        # Map columns
        col_map = {}
        for col in range(1, ws.max_column + 1):
            val = self._cell_val(ws, header_row, col)
            if val:
                key = str(val).replace("\n", "").strip()
                col_map[key] = col

        date_col = col_map.get("日期", 2)
        time_col = col_map.get("时间/班别", 5)
        reason_col = col_map.get("洗模原因", 6)
        method_col = col_map.get("洗模方式", 7)
        mold_count_col = col_map.get("模数", 8)
        cure_time_col = col_map.get("固化时间(sec)", 9)
        mold_no_col = col_map.get("模具号", 10)
        clamp_col = col_map.get("合模压力(ton)", 11)
        inject_col = col_map.get("注塑压强(kgf/cm²)", 12)

        # Find 区分, 设定值, 显示值 columns
        sub_row = header_row + 1
        div_col = set_col = disp_col = None
        for col in range(1, ws.max_column + 1):
            val = self._cell_val(ws, sub_row, col)
            if val == "区分":
                div_col = col
            elif val == "设定值":
                set_col = col
            elif val == "显示值":
                disp_col = col

        # Display value sub-columns
        disp_cols = []
        sub_sub_row = header_row + 2
        if disp_col:
            for col in range(disp_col, ws.max_column + 1):
                val = self._cell_val(ws, sub_sub_row, col)
                if val and str(val).strip().isdigit():
                    disp_cols.append(col)
                if len(disp_cols) >= 4:
                    break

        # Find appearance check columns (1st, 2nd, 3th, 4th, 5th)
        appearance_cols = []
        for col in range(disp_col + 5 if disp_col else 20, ws.max_column + 1):
            val = self._cell_val(ws, sub_sub_row, col)
            if val and ("st" in str(val) or "nd" in str(val) or "th" in str(val)):
                appearance_cols.append(col)
            if len(appearance_cols) >= 5:
                break

        # Find mold status and pin status columns
        mold_status_col = col_map.get("模具状态")
        pin_status_col = col_map.get("定位针状态")
        sign_col = col_map.get("签名")

        # Get inspection date
        inspection_date = ""
        date_text_row = self._find_row_with_text(ws, "年")
        if date_text_row:
            for col in range(1, 10):
                val = self._cell_val(ws, date_text_row, col)
                if val and "年" in str(val):
                    inspection_date = str(val).strip()
                    break

        # Build headers
        headers = [
            {"key": "wash_reason", "label": "洗模原因", "group": "基本"},
            {"key": "wash_method", "label": "洗模方式", "group": "基本"},
            {"key": "mold_count", "label": "模数", "group": "基本"},
            {"key": "cure_time", "label": "固化时间(sec)", "group": "基本"},
            {"key": "mold_no", "label": "模具号", "group": "基本"},
            {"key": "clamp_pressure", "label": "合模压力(ton)", "group": "参数"},
            {"key": "inject_pressure", "label": "注塑压强(kgf/cm²)", "group": "参数"},
        ]
        for pos in ["上模", "下模"]:
            headers.append({"key": f"set_temp_{pos}", "label": f"设定值({pos})", "group": "模温"})
            for i in range(1, 5):
                headers.append({"key": f"disp_temp_{pos}_{i}", "label": f"显示值{i}({pos})", "group": "模温"})
        for i in range(1, 6):
            headers.append({"key": f"appearance_{i}", "label": f"外观确认{i}", "group": "外观"})
        headers.append({"key": "mold_status", "label": "模具状态", "group": "状态"})
        headers.append({"key": "pin_status", "label": "定位针状态", "group": "状态"})

        # Parse data rows
        data_start = sub_sub_row + 1
        rows = []
        meta_rows = []
        row = data_start

        while row <= ws.max_row:
            # Check for end
            first_val = self._cell_val(ws, row, 1)
            if first_val and ("备注" in str(first_val) or "REV" in str(first_val)):
                break

            mold_val = self._cell_val(ws, row, mold_no_col) if mold_no_col else None
            div_val = self._cell_val(ws, row, div_col) if div_col else None

            if not mold_val and not div_val:
                row += 1
                continue

            if div_val and str(div_val).strip() in ("上模", "下模"):
                pos = str(div_val).strip()
                values = {}
                cells = {}

                # Basic info (might be from a previous merged row)
                values["date"] = str(self._cell_val(ws, row, date_col) or "")
                values["time"] = str(self._cell_val(ws, row, time_col) or "")
                values["wash_reason"] = self._cell_val(ws, row, reason_col)
                cells["wash_reason"] = [row, reason_col]
                values["wash_method"] = self._cell_val(ws, row, method_col)
                cells["wash_method"] = [row, method_col]
                values["mold_count"] = self._cell_val(ws, row, mold_count_col)
                cells["mold_count"] = [row, mold_count_col]
                values["cure_time"] = self._cell_val(ws, row, cure_time_col)
                cells["cure_time"] = [row, cure_time_col]
                values["mold_no"] = self._cell_val(ws, row, mold_no_col)
                cells["mold_no"] = [row, mold_no_col]
                values["clamp_pressure"] = self._cell_val(ws, row, clamp_col)
                cells["clamp_pressure"] = [row, clamp_col]
                values["inject_pressure"] = self._cell_val(ws, row, inject_col)
                cells["inject_pressure"] = [row, inject_col]

                # Temperature
                values[f"set_temp_{pos}"] = self._cell_val(ws, row, set_col) if set_col else None
                if set_col:
                    cells[f"set_temp_{pos}"] = [row, set_col]
                for i, dc in enumerate(disp_cols):
                    values[f"disp_temp_{pos}_{i+1}"] = self._cell_val(ws, row, dc)
                    cells[f"disp_temp_{pos}_{i+1}"] = [row, dc]

                # Check next row for other mold position
                if row + 1 <= ws.max_row:
                    next_div = self._cell_val(ws, row + 1, div_col) if div_col else None
                    if next_div and str(next_div).strip() in ("上模", "下模"):
                        next_pos = str(next_div).strip()
                        values[f"set_temp_{next_pos}"] = self._cell_val(ws, row + 1, set_col) if set_col else None
                        if set_col:
                            cells[f"set_temp_{next_pos}"] = [row + 1, set_col]
                        for i, dc in enumerate(disp_cols):
                            values[f"disp_temp_{next_pos}_{i+1}"] = self._cell_val(ws, row + 1, dc)
                            cells[f"disp_temp_{next_pos}_{i+1}"] = [row + 1, dc]
                        row += 1

                # Appearance
                for i, ac in enumerate(appearance_cols):
                    values[f"appearance_{i+1}"] = self._cell_val(ws, row, ac)
                    cells[f"appearance_{i+1}"] = [row, ac]

                # Status
                if mold_status_col:
                    values["mold_status"] = self._cell_val(ws, row, mold_status_col)
                    cells["mold_status"] = [row, mold_status_col]
                if pin_status_col:
                    values["pin_status"] = self._cell_val(ws, row, pin_status_col)
                    cells["pin_status"] = [row, pin_status_col]

                date_str = values.pop("date")
                time_str = values.pop("time")
                signer = self._cell_val(ws, row, sign_col) if sign_col else ""

                rows.append({
                    "date": date_str,
                    "time": time_str,
                    "values": values,
                    "extra": {"signer": str(signer) if signer else ""},
                })
                meta_rows.append({"row": row, "cells": cells})

            row += 1

        return {
            "equipment_id": equipment_id,
            "inspection_date": inspection_date,
            "headers": headers,
            "rows": rows,
            "meta": {"row_map": meta_rows, "judgment_col": None},
        }
