# Auto Inspection Forms

製造業點檢表自動核對系統。上傳 Excel 點檢記錄表，系統自動辨識表單類型、解析數據、比對規格標準，產出 OK/NG 判定結果並匯出報表。

## 功能特色

- **自動辨識表單** — 6 級優先識別（檔名正則 > 關鍵字 > Sheet 名 > 內容 > 資料庫 > AI）
- **5 種內建表單解析器** — F-QA1021、F-RD09AA、F-RD09AB、F-RD09AJ、F-RD09AK
- **通用解析器** — 自動偵測表頭，零程式碼擴展新表單類型
  - 標準行列格式（自動偵測中文表頭）
  - 多層表頭（子標題自動合併為群組）
  - 轉置/樞紐格式（日期橫向展開，自動轉置）
- **表頭規格提取** — 無需「匯總」Sheet，從 data sheet 表頭自動提取檢查項目與內嵌規格
- **多種規格判定** — 範圍 (`125~145`)、門檻值 (`≥3`)、勾選 (`√`)、文字 (`OK`)、略過 (`/`)
- **批次上傳** — 一次上傳多個檔案，批次處理並匯總結果
- **規格管理** — 匯入 / 編輯 / 版本追蹤 / 回溯
- **匯出報表** — 單 Sheet / 整份上傳 / 批次 ZIP，OK 綠色 / NG 紅色標註
- **AI 輔助** — DeepSeek API 進行表單辨識與規格提取（可選）
- **多語系** — 繁中、簡中、英文

## 技術架構

| 層級 | 技術 |
|------|------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS |
| 後端 | Python FastAPI + SQLAlchemy + openpyxl |
| 資料庫 | MySQL (PyMySQL) |
| AI | DeepSeek API (可選) |

## 專案結構

```
auto-inspection-forms/
├── backend/
│   ├── main.py                 # FastAPI 進入點，路由註冊，DB 遷移
│   ├── config.py               # 環境變數與設定
│   ├── models.py               # SQLAlchemy ORM 模型
│   ├── database.py             # 資料庫連線管理
│   ├── parsers/                # 表單解析器
│   │   ├── base.py             # 解析器基底類別
│   │   ├── identifier.py       # 表單類型辨識引擎
│   │   ├── generic_parser.py   # 通用解析器（標準/多層表頭/轉置格式）
│   │   ├── qa1021_parser.py    # F-QA1021 離子消散設備
│   │   ├── rd09aa_parser.py    # F-RD09AA Auto Mold 機台
│   │   ├── rd09ab_parser.py    # F-RD09AB Auto Mold 洗模
│   │   ├── rd09aj_parser.py    # F-RD09AJ RO 焊接爐
│   │   └── rd09ak_parser.py    # F-RD09AK SMD 切彎腳
│   ├── routers/                # API 路由
│   │   ├── upload.py           # 上傳（單檔/批次）
│   │   ├── results.py          # 結果查詢與歷史紀錄
│   │   ├── specs.py            # 規格管理 CRUD
│   │   └── download.py         # 匯出下載
│   ├── services/               # 業務邏輯
│   │   ├── judgment.py         # 判定引擎（四層模糊匹配）
│   │   ├── spec_service.py     # 規格匯入與管理
│   │   ├── export_service.py   # Excel 匯出（合併儲存格處理）
│   │   ├── header_spec_extractor.py  # 表頭規格自動提取
│   │   ├── ai_service.py       # DeepSeek API 整合
│   │   ├── ai_spec_parser.py   # AI 規格提取
│   │   ├── spec_version_service.py    # 版本追蹤
│   │   ├── fingerprint_service.py     # 結構指紋
│   │   └── import_preview_service.py  # 匯入預覽
│   ├── utils/
│   │   └── spec_parser.py      # 規格字串解析
│   ├── spec_files/             # 規格 Excel 檔案
│   └── uploads/                # 使用者上傳檔案
│
├── frontend/
│   └── src/
│       ├── pages/              # 頁面
│       │   ├── Upload.tsx      # 上傳 & 結果檢視
│       │   ├── Results.tsx     # 歷史紀錄（批次瀏覽）
│       │   ├── ResultDetail.tsx# 單次上傳詳細判定
│       │   ├── SpecManagement.tsx # 規格管理
│       │   └── SpecDetail.tsx  # 規格明細編輯
│       ├── components/         # 共用元件
│       ├── api/client.ts       # Axios API 客戶端
│       ├── types/index.ts      # TypeScript 型別定義
│       └── i18n/               # 國際化設定
│
├── data/                       # 範本表單（參考用）
└── package.json                # Monorepo 啟動腳本
```

## 資料庫模型

```
FormType ──< FormSpec ──< SpecItem
                 ├──< SpecVersion
UploadRecord ──< InspectionResult >── FormSpec
```

| 模型 | 說明 |
|------|------|
| `FormType` | 表單類型（代碼、名稱、辨識關鍵字、結構指紋） |
| `FormSpec` | 設備規格（綁定表單類型 + 設備 ID） |
| `SpecItem` | 規格項目（名稱、類型、上下限、預期值） |
| `UploadRecord` | 上傳紀錄（檔名、狀態、批次 ID） |
| `InspectionResult` | 檢驗結果（原始數據、判定數據、整體結果） |
| `SpecVersion` | 規格版本快照（變更摘要、回溯支援） |

## 支援的表單類型

### 內建解析器（5 種）

| 代碼 | 名稱 | 設備模式 |
|------|------|----------|
| F-QA1021 | 離子消散設備點檢記錄表 | `RD-LZ-*` |
| F-RD09AA | Auto Mold 機台檢查記錄表 | `WP*-*` |
| F-RD09AB | Auto Mold 洗模檢查記錄表 | `WP*-*` |
| F-RD09AJ | RO 焊接爐檢查記錄表 | `WCBA-*` |
| F-RD09AK | SMD (Clip) 切彎腳尺寸檢查記錄表 | `WTFB-*` |

### 通用解析器（GenericParser）

以下表單類型透過通用解析器 + 表頭規格提取，無需撰寫專用程式碼即可支援：

| 代碼 | 名稱 | 格式 |
|------|------|------|
| F-RD0976 | S焊清洗液添排液檢查記錄表 | 標準行列 |
| F-RD09AC | Clip Bond 檢查記錄表 | 標準行列（含內嵌規格） |
| F-RD09AL | SMD 切彎腳外觀抽驗記錄表 | 多層表頭 |
| F-RD09AN | TMTT 印字影像準確度檢查記錄表 | 標準行列 |
| F-RD09AY | SMD AU 首件檢查記錄表 | 標準行列 |
| F-RD09B10 | 純水電阻率檢查記錄表 | 標準行列 |
| F-RD09BU | Clip Bond 外觀檢查記錄表 | 多層表頭 |
| F-RD09BW | TMTT站 Vision 開機首件檢查記錄表 | 標準行列 |
| F-RD09CS | Clip Bond 出爐外觀檢查表 | 標準行列 |
| F-RD09EA | 新弘田清洗機檢查記錄表 | 標準行列（含內嵌規格） |
| F-RD09F1 | 溫度/濕度檢查記錄表 | 轉置格式 |
| F-RD09FZ | SMD-C AU TMTT站外觀檢查記錄表 | 標準行列 |
| F-RD09GA | SMD-C AU TMTT站開機首件檢查記錄表 | 多層表頭（含判定欄） |
| F-RD09GB | SMD-C AU TMTT 封合拉力測試記錄表 | 多層表頭（含判定欄） |
| F-RD09Q1 | 錫膏放置冰箱溫度檢查記錄表 | 轉置格式 |
| F-RD09X7 | 機台調整後復機點檢表 | 標準行列 |
| F-RD1024 | SMD AU Line 外觀檢查記錄表 | 轉置格式 |
| F-RD2123 | 防潮櫃檢查記錄表 | 轉置格式 |
| F-RD2140 | 烤箱作業記錄表 | 標準行列 |

## 快速開始

### 前置需求

- Node.js 18+
- Python 3.11+
- MySQL 8.0+
- pnpm

### 安裝

```bash
# 安裝前端依賴
pnpm install
cd frontend && pnpm install && cd ..

# 安裝後端依賴
cd backend
python -m venv .venv
.venv/Scripts/activate   # Windows
# source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
```

### 環境設定

在 `backend/` 目錄建立 `.env` 檔案：

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DB=db_auto_inspection
MYSQL_USER=your_user
MYSQL_PASSWORD=your_password
UPLOAD_DIR=./uploads
SPEC_DIR=./spec_files

# 可選：AI 輔助辨識
deepseek_api_key=your_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

### 啟動

```bash
# 同時啟動前後端
pnpm dev

# 或分別啟動
pnpm dev:backend    # 後端 http://localhost:8000
pnpm dev:frontend   # 前端 http://localhost:5173
```

前端開發伺服器會自動將 `/api` 請求代理到後端。

## API 概覽

### 上傳

| Method | Endpoint | 說明 |
|--------|----------|------|
| `POST` | `/api/upload` | 上傳單一 Excel 檔案 |
| `POST` | `/api/upload/batch` | 批次上傳多個檔案 |

### 結果查詢

| Method | Endpoint | 說明 |
|--------|----------|------|
| `GET` | `/api/results` | 列出上傳紀錄（分頁） |
| `GET` | `/api/results/batches` | 列出上傳批次 |
| `GET` | `/api/results/{id}` | 取得上傳詳細結果（即時重新判定） |
| `GET` | `/api/results/sheet/{id}` | 取得單一 Sheet 結果 |
| `DELETE` | `/api/results/batches/{batch_id}` | 刪除批次 |

### 規格管理

| Method | Endpoint | 說明 |
|--------|----------|------|
| `GET` | `/api/specs/form-types` | 列出所有表單類型 |
| `POST` | `/api/specs/form-types` | 新增自訂表單類型 |
| `GET` | `/api/specs/form-types/{code}/specs` | 取得表單規格列表 |
| `POST` | `/api/specs/import/preview` | 預覽規格匯入變更 |
| `POST` | `/api/specs/import/confirm` | 確認匯入規格 |
| `GET` | `/api/specs/specs/{id}/versions` | 取得版本歷史 |
| `POST` | `/api/specs/specs/{id}/versions/{vid}/rollback` | 回溯至指定版本 |

### 匯出下載

| Method | Endpoint | 說明 |
|--------|----------|------|
| `GET` | `/api/download/sheet/{id}` | 下載單一 Sheet 結果 (Excel) |
| `GET` | `/api/download/upload/{id}` | 下載整份上傳結果 (Excel) |
| `POST` | `/api/download/batch` | 批次下載 (ZIP) |

## 使用流程

### 新增表單類型（零程式碼）

1. 進入「規格管理」頁面，新增表單類型
2. 上傳該表單的 Excel 檔案作為規格來源
3. 系統自動從表頭提取檢查項目（有內嵌規格自動解析，無規格的項目可手動補充）
4. 即可開始上傳點檢資料進行判定

### 上傳點檢表

1. 進入「上傳」頁面，選擇或拖放 Excel 檔案
2. 系統自動辨識表單類型 & 解析各 Sheet
3. 比對規格產出 OK/NG 判定
4. 檢視結果並下載報表

### 管理規格

1. 進入「規格管理」頁面
2. 選擇表單類型，上傳規格 Excel（支援有/無「匯總」Sheet）
3. 預覽變更差異，確認匯入
4. 規格即刻生效，歷史版本可追蹤與回溯

## License

Private
