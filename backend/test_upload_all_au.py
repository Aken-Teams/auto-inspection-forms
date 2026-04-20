"""Test uploading all 26 AU files via the API."""
import os
import sys
import json
import shutil
import httpx

sys.stdout.reconfigure(encoding='utf-8')

AU_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "AU未建立规格点检表", "AU")
API_URL = "http://localhost:8000/api/upload"
TEMP_DIR = os.path.join(os.environ.get("TEMP", "/tmp"), "au_test")


def main():
    os.makedirs(TEMP_DIR, exist_ok=True)
    files = sorted(f for f in os.listdir(AU_DIR) if f.endswith((".xlsx", ".xls")))

    print(f"\n{'='*90}")
    print(f"Uploading {len(files)} AU files to API")
    print(f"{'='*90}\n")

    results = []
    client = httpx.Client(timeout=60.0)

    for filename in files:
        src = os.path.join(AU_DIR, filename)
        # Copy to temp to avoid path encoding issues
        safe_name = filename.replace(" ", "_").replace("\uff09", ")").replace("\u3000", "_")
        tmp_path = os.path.join(TEMP_DIR, safe_name)
        shutil.copy2(src, tmp_path)

        try:
            with open(tmp_path, "rb") as f:
                resp = client.post(
                    API_URL,
                    files={"file": (filename, f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                )

            if resp.status_code == 200:
                data = resp.json()
                form_code = data.get("form_type", "?")
                form_name = data.get("form_name", "?")
                total = data.get("total_sheets", 0)
                processed = data.get("processed_sheets", 0)
                sheet_results = data.get("results", [])

                ok = sum(1 for r in sheet_results if r.get("overall_result") == "OK")
                ng = sum(1 for r in sheet_results if r.get("overall_result") == "NG")
                no_spec = sum(1 for r in sheet_results if r.get("overall_result") == "NO_SPEC")
                err = sum(1 for r in sheet_results if r.get("overall_result") == "ERROR")

                results.append(("OK", filename, form_code, form_name, total, ok, ng, no_spec, err))
                print(f"  [OK] {filename}")
                print(f"       form: {form_code} ({form_name})")
                print(f"       sheets: {processed}/{total} | OK:{ok} NG:{ng} NO_SPEC:{no_spec} ERR:{err}")
            else:
                error_detail = resp.text[:200]
                results.append(("FAIL", filename, None, None, 0, 0, 0, 0, 0))
                print(f"  [FAIL] {filename}")
                print(f"         HTTP {resp.status_code}: {error_detail}")
        except Exception as e:
            results.append(("ERROR", filename, None, None, 0, 0, 0, 0, 0))
            print(f"  [ERROR] {filename}")
            print(f"          {e}")

    client.close()

    # Summary
    total_ok = sum(1 for r in results if r[0] == "OK")
    total_fail = sum(1 for r in results if r[0] == "FAIL")
    total_err = sum(1 for r in results if r[0] == "ERROR")

    print(f"\n{'='*90}")
    print(f"Upload Results: {total_ok}/{len(results)} success | {total_fail} failed | {total_err} errors")
    print(f"{'='*90}")

    # Show unique form types discovered
    form_types = {}
    for r in results:
        if r[0] == "OK" and r[2]:
            form_types[r[2]] = r[3]

    print(f"\nForm types discovered ({len(form_types)}):")
    for code in sorted(form_types):
        print(f"  {code}: {form_types[code]}")

    # Cleanup
    shutil.rmtree(TEMP_DIR, ignore_errors=True)

    return total_ok == len(results)


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
