"""Parser for F-RD09AK SMD(Clip）切弯脚尺寸检查记录表."""
import re
from parsers.base import BaseParser


class RD09AKParser(BaseParser):
    form_code = "F-RD09AK"

    # Structure:
    # Row 4: Package：SMA-C
    # Row 5: 机台编号：WTFB-0004
    # Row 7: headers (日期班别, 时间, 测量者, 成品料号, 批号, 部位, 测量值(mm) 1-24, 判定, 签名, 签核)
    # Row 8: measurement column numbers (1-24)
    # Row 9+: data (groups of 5 rows: A, G1, G2, G3, G4)

    def _parse_impl(self, ws, sheet_name):
        # Extract equipment ID from sheet name
        equip_match = re.match(r"(WTFB-\d+)", sheet_name)
        equipment_id = equip_match.group(1) if equip_match else sheet_name

        # Find Package and machine info
        package = ""
        for row in range(1, 10):
            for col in range(1, 10):
                val = self._cell_val(ws, row, col)
                if val and "Package" in str(val):
                    package_match = re.search(r"Package[：:]\s*(\S+)", str(val))
                    if package_match:
                        package = package_match.group(1)

        # Find header row (look for "日期" or "部位")
        header_row = self._find_row_with_text(ws, "部位")
        if not header_row:
            header_row = 7

        # Map columns
        col_map = {}
        for col in range(1, ws.max_column + 1):
            val = self._cell_val(ws, header_row, col)
            if val:
                key = str(val).replace("\n", "").strip()
                col_map[key] = col

        date_col = col_map.get("日期班别", col_map.get("日期\n班别", 2))
        time_col = col_map.get("时间", 3)
        measurer_col = col_map.get("测量者", 4)
        product_col = col_map.get("成品料号", 5)
        lot_col = col_map.get("批号", 6)
        part_col = col_map.get("部位", 7)
        judge_col = col_map.get("判定")
        sign_col = col_map.get("签名")

        # Find measurement columns from number row
        num_row = header_row + 1
        meas_cols = []
        for col in range(1, ws.max_column + 1):
            val = self._cell_val(ws, num_row, col)
            if val and str(val).strip().isdigit():
                meas_cols.append((int(str(val).strip()), col))

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
            {"key": "product_no", "label": "成品料号", "group": "基本"},
            {"key": "lot_no", "label": "批号", "group": "基本"},
            {"key": "part", "label": "部位", "group": "基本"},
        ]
        for num, _ in meas_cols:
            headers.append({"key": f"meas_{num}", "label": f"测量值{num}(mm)", "group": "测量"})
        headers.append({"key": "judgment", "label": "判定", "group": "判定"})

        # Parse data rows
        data_start = num_row + 1
        rows = []
        meta_rows = []
        parts = ["A", "G1", "G2", "G3", "G4"]

        row = data_start
        while row <= ws.max_row:
            # Check for end
            for col in range(1, 5):
                val = self._cell_val(ws, row, col)
                if val and ("备注" in str(val) or "REV" in str(val)):
                    row = ws.max_row + 1
                    break
            if row > ws.max_row:
                break

            part_val = self._cell_val(ws, row, part_col) if part_col else None
            date_val = self._cell_val(ws, row, date_col)

            if not part_val and not date_val:
                row += 1
                continue

            values = {}
            cells = {}
            values["product_no"] = self._cell_val(ws, row, product_col)
            cells["product_no"] = [row, product_col]
            values["lot_no"] = self._cell_val(ws, row, lot_col)
            cells["lot_no"] = [row, lot_col]
            values["part"] = str(part_val) if part_val else ""
            cells["part"] = [row, part_col]

            for num, col in meas_cols:
                values[f"meas_{num}"] = self._cell_val(ws, row, col)
                cells[f"meas_{num}"] = [row, col]

            judge_val = self._cell_val(ws, row, judge_col) if judge_col else None
            values["judgment"] = judge_val
            if judge_col:
                cells["judgment"] = [row, judge_col]

            signer = self._cell_val(ws, row, sign_col) if sign_col else ""

            rows.append({
                "date": str(date_val) if date_val else "",
                "time": str(self._cell_val(ws, row, time_col) or ""),
                "values": values,
                "extra": {
                    "signer": str(signer) if signer else "",
                    "measurer": str(self._cell_val(ws, row, measurer_col) or ""),
                    "package": package,
                },
            })
            meta_rows.append({"row": row, "cells": cells})

            row += 1

        return {
            "equipment_id": equipment_id,
            "inspection_date": inspection_date,
            "headers": headers,
            "rows": rows,
            "extra": {"package": package},
            "meta": {"row_map": meta_rows, "judgment_col": judge_col},
        }
