"""Script to initialize form types and import specs from the 5 Excel files."""
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal, engine, Base
from services.spec_service import init_form_types, import_specs_from_excel

# Create tables
Base.metadata.create_all(bind=engine)

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

EXCEL_FILES = {
    "F-QA1021": "F-QA1021_离子消散设备点检记录表.xlsx",
    "F-RD09AA": "F-RD09AA-Auto Mold 机台检查记录表.xlsx",
    "F-RD09AB": "F-RD09AB-Auto Mold 洗模检查记录表.xlsx",
    "F-RD09AJ": "F-RD09AJ-RO 焊接炉检查记录表.xlsx",
    "F-RD09AK": "F-RD09AK_SMD(Clip）切弯脚尺寸检查记录表.xlsx",
}


def main():
    db = SessionLocal()
    try:
        print("Initializing form types...")
        init_form_types(db)
        print("Form types initialized.")

        for form_code, filename in EXCEL_FILES.items():
            filepath = os.path.join(DATA_DIR, filename)
            if not os.path.exists(filepath):
                print(f"  [SKIP] {filename} not found")
                continue

            print(f"  Importing specs from {filename}...")
            result = import_specs_from_excel(db, filepath, form_code)
            if "error" in result:
                print(f"    ERROR: {result['error']}")
            else:
                print(f"    OK")

        print("\nDone! Specs imported successfully.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
