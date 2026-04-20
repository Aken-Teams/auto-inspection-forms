"""Base parser class for Excel inspection forms."""
from abc import ABC, abstractmethod
from openpyxl import Workbook
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy.orm import Session


class BaseParser(ABC):
    """Base class for form-specific parsers."""

    form_code: str = ""

    def parse_sheet(self, ws: Worksheet, sheet_name: str) -> dict:
        """Parse a raw data sheet and return structured data.

        Returns:
            {
                "equipment_id": str,
                "inspection_date": str,
                "headers": [{"key": str, "label": str, "group": str}],
                "rows": [
                    {
                        "date": str,
                        "time": str,
                        "values": {item_key: raw_value, ...},
                        "extra": {key: value, ...}
                    }
                ]
            }
        """
        return self._parse_impl(ws, sheet_name)

    @abstractmethod
    def _parse_impl(self, ws: Worksheet, sheet_name: str) -> dict:
        pass

    def _cell_val(self, ws: Worksheet, row: int, col: int):
        """Get cell value by row and column number (1-indexed)."""
        val = ws.cell(row=row, column=col).value
        if val is None:
            return None
        if isinstance(val, str):
            val = val.strip()
            if val == "":
                return None
        return val

    def _find_row_with_text(self, ws: Worksheet, text: str, max_row: int = 20) -> int | None:
        """Find the first row containing the given text."""
        for row in range(1, max_row + 1):
            for col in range(1, ws.max_column + 1):
                val = self._cell_val(ws, row, col)
                if val and text in str(val):
                    return row
        return None
