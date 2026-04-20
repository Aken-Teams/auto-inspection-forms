"""DeepSeek AI service for Excel form identification and analysis."""
import json
import re
import logging
import httpx
from config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = httpx.Client(
            base_url=DEEPSEEK_BASE_URL,
            headers={
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )
    return _client


def _call_deepseek(messages: list[dict], temperature: float = 0.1,
                   max_tokens: int = 2000) -> str | None:
    """Call DeepSeek chat API and return the response text."""
    if not DEEPSEEK_API_KEY:
        logger.warning("DeepSeek API key not configured")
        return None

    try:
        client = _get_client()
        resp = client.post(
            "/v1/chat/completions",
            json={
                "model": "deepseek-chat",
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]
    except Exception as e:
        logger.error(f"DeepSeek API error: {e}")
        return None


def _extract_json(text: str) -> dict | None:
    """Extract JSON object from AI response text."""
    if not text:
        return None
    # Try to find JSON block in markdown code fence
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    # Try to parse the whole text as JSON
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try to find any JSON object in the text
    m = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return None


def identify_form_type_ai(
    filename: str,
    sheet_names: list[str],
    sheet_content_sample: str,
) -> dict | None:
    """Use DeepSeek AI to identify form type from Excel content.

    Args:
        filename: Original filename
        sheet_names: List of sheet names
        sheet_content_sample: Text content from first few rows of first data sheet

    Returns:
        dict with keys: form_code, form_name, equipment_id_pattern, description
        or None if identification failed
    """
    prompt = f"""你是一个工业检验表格分析AI。根据以下Excel文件信息，识别这是哪种检验表格。

文件名: {filename}
工作表名称: {', '.join(sheet_names)}

第一个数据工作表的前几行内容:
{sheet_content_sample[:3000]}

请分析并以JSON格式回答（不要添加其他说明文字）:
{{
  "form_code": "从文件名提取的表格编号(例如F-RD09AC, F-QA1021等，通常以F-开头)",
  "form_name": "表格的中文全称(从内容中提取，例如'Auto Mold 机台检查记录表')",
  "equipment_id_pattern": "设备编号的正则表达式(从工作表名提取设备编号的模式)",
  "description": "简要描述这个检验表格检查什么内容"
}}

注意:
1. form_code 通常嵌在文件名中，格式如 F-XX####XX (如F-RD09AC, F-QA1021, F-RD2140)
2. 设备编号通常是工作表名(如WPRN-0001, WCBA-0001, RD-LZ-14等)
3. form_name 应该从表格标题行提取完整的中文名称
4. 如果无法确定某字段，使用null"""

    result = _call_deepseek([{"role": "user", "content": prompt}])
    parsed = _extract_json(result)

    if parsed and parsed.get("form_code"):
        # Clean up form_code - ensure it starts with F-
        code = parsed["form_code"].strip()
        if not code.startswith("F-"):
            code = f"F-{code}"
        parsed["form_code"] = code
        logger.info(f"AI identified form: {code} - {parsed.get('form_name', '?')}")
        return parsed

    # Fallback: try to extract form code from filename with regex
    code_match = re.search(r"(F-[A-Z]{2}\d{2,4}[A-Z]{0,2})", filename, re.IGNORECASE)
    if code_match:
        code = code_match.group(1).upper()
        logger.info(f"Regex extracted form code from filename: {code}")
        return {
            "form_code": code,
            "form_name": filename.split(".")[0],
            "equipment_id_pattern": None,
            "description": f"Auto-detected from filename: {filename}",
        }

    return None


def extract_form_name_ai(filename: str, sheet_content_sample: str) -> str | None:
    """Use AI to extract the Chinese form name from content."""
    prompt = f"""从以下检验表格内容中提取表格的中文全称（标题行通常在前几行）。

文件名: {filename}
内容:
{sheet_content_sample[:2000]}

只回答表格的中文名称，不要其他文字。例如: "Auto Mold 机台检查记录表" 或 "焊接炉检查记录表" """

    result = _call_deepseek([{"role": "user", "content": prompt}])
    if result:
        name = result.strip().strip('"\'')
        if len(name) < 100:
            return name
    return None


def is_ai_available() -> bool:
    """Check if DeepSeek AI is configured and available."""
    return bool(DEEPSEEK_API_KEY)
