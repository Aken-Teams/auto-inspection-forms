"""Generic parser for unrecognized Excel inspection forms."""
from parsers.base import BaseParser


class GenericParser(BaseParser):
    form_code = "GENERIC"

    def _parse_impl(self, ws, sheet_name):
        """Generic parser that reads all non-empty cells."""
        headers = []
        rows = []

        # Find the first row with data to determine header
        header_row = None
        for row in range(1, min(20, ws.max_row + 1)):
            non_empty = 0
            for col in range(1, ws.max_column + 1):
                if self._cell_val(ws, row, col) is not None:
                    non_empty += 1
            if non_empty >= 3:
                header_row = row
                break

        if not header_row:
            return {
                "equipment_id": sheet_name,
                "inspection_date": "",
                "headers": [],
                "rows": [],
            }

        # Build headers from header row
        col_headers = {}
        for col in range(1, ws.max_column + 1):
            val = self._cell_val(ws, header_row, col)
            if val:
                key = f"col_{col}"
                label = str(val).replace("\n", " ").strip()
                headers.append({"key": key, "label": label, "group": "data"})
                col_headers[col] = key

        # Read data rows
        meta_rows = []
        for row in range(header_row + 1, ws.max_row + 1):
            values = {}
            cells = {}
            has_data = False
            for col, key in col_headers.items():
                val = self._cell_val(ws, row, col)
                if val is not None:
                    has_data = True
                values[key] = val
                cells[key] = [row, col]

            if has_data:
                first_val = self._cell_val(ws, row, 1)
                if first_val and ("备注" in str(first_val) or "REV" in str(first_val)):
                    break
                rows.append({
                    "date": "",
                    "time": "",
                    "values": values,
                    "extra": {},
                })
                meta_rows.append({"row": row, "cells": cells})

        return {
            "equipment_id": sheet_name,
            "inspection_date": "",
            "headers": headers,
            "rows": rows,
            "meta": {"row_map": meta_rows, "judgment_col": None},
        }
