export interface UploadResult {
  upload_id: number;
  filename: string;
  form_type: string | null;
  form_name: string;
  total_sheets: number;
  processed_sheets: number;
  results: SheetResultSummary[];
}

export interface SheetResultSummary {
  sheet_name: string;
  equipment_id?: string;
  has_spec: boolean;
  overall_result: 'OK' | 'NG' | 'NO_SPEC' | 'ERROR';
  summary?: { total: number; ok: number; ng: number; skip: number };
  error?: string;
}

export interface UploadListItem {
  id: number;
  filename: string;
  form_code: string | null;
  form_name: string;
  upload_time: string;
  status: string;
  total_sheets: number;
  ok_count: number;
  ng_count: number;
  no_spec_count: number;
}

export interface UploadDetail {
  id: number;
  filename: string;
  form_code: string | null;
  form_name: string;
  upload_time: string;
  status: string;
  error_message: string | null;
  sheets: SheetResult[];
}

export interface SheetResult {
  id: number;
  sheet_name: string;
  equipment_id: string;
  has_spec: boolean;
  overall_result: 'OK' | 'NG' | 'NO_SPEC' | 'ERROR';
  inspection_date: string;
  judged_data: JudgedData;
  raw_data: ParsedData;
}

export interface ParsedData {
  equipment_id: string;
  inspection_date: string;
  headers: { key: string; label: string; group: string }[];
  rows: ParsedRow[];
}

export interface ParsedRow {
  date: string;
  time: string;
  values: Record<string, unknown>;
  extra: Record<string, unknown>;
}

export interface JudgedData {
  has_spec: boolean;
  form_spec_id: number | null;
  overall_result: string;
  judged_rows: JudgedRow[];
  summary: { total: number; ok: number; ng: number; skip: number };
}

export interface JudgedRow {
  date: string;
  time: string;
  values: Record<string, JudgedValue>;
  extra: Record<string, unknown>;
  row_judgment?: 'OK' | 'NG' | 'SKIP' | 'NO_SPEC';
}

export interface JudgedValue {
  raw: unknown;
  judgment: 'OK' | 'NG' | 'SKIP' | 'NO_SPEC' | 'ERROR';
  spec: string;
}

export interface UploadBatch {
  batch_id: string;
  upload_time: string;
  file_count: number;
  total_sheets: number;
  ok_count: number;
  ng_count: number;
  no_spec_count: number;
  form_types: string[];
  files: UploadListItem[];
}

export interface FormType {
  id: number;
  form_code: string;
  form_name: string;
  description: string | null;
  file_pattern: string | null;
  is_builtin: boolean;
  spec_count: number;
}

export interface FormSpec {
  id: number;
  equipment_id: string;
  equipment_name: string;
  extra_info: Record<string, unknown>;
  items: SpecItemData[];
}

export interface SpecItemData {
  id: number;
  item_name: string;
  spec_type: string;
  min_value: number | null;
  max_value: number | null;
  expected_text: string | null;
  threshold_value: number | null;
  threshold_operator: string | null;
  display_order: number;
  group_name: string | null;
  sub_group: string | null;
}
