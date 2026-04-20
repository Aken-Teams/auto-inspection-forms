"""FastAPI application entry point."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect

from database import engine, Base
from routers import upload, results, specs, download

# Create tables
Base.metadata.create_all(bind=engine)

# Migrate: add new columns to existing tables
def _migrate():
    inspector = inspect(engine)
    with engine.connect() as conn:
        # Add batch_id to upload_records
        cols = [c["name"] for c in inspector.get_columns("upload_records")]
        if "batch_id" not in cols:
            conn.execute(text("ALTER TABLE upload_records ADD COLUMN batch_id VARCHAR(36) DEFAULT NULL"))
            conn.execute(text("CREATE INDEX ix_upload_records_batch_id ON upload_records(batch_id)"))
            conn.commit()
        # Add file_pattern and is_builtin to form_types
        ft_cols = [c["name"] for c in inspector.get_columns("form_types")]
        if "file_pattern" not in ft_cols:
            conn.execute(text("ALTER TABLE form_types ADD COLUMN file_pattern VARCHAR(500) DEFAULT NULL"))
            conn.commit()
        if "is_builtin" not in ft_cols:
            conn.execute(text("ALTER TABLE form_types ADD COLUMN is_builtin TINYINT(1) DEFAULT 0"))
            conn.execute(text("UPDATE form_types SET is_builtin = 1 WHERE form_code IN ('F-QA1021','F-RD09AA','F-RD09AB','F-RD09AJ','F-RD09AK')"))
            conn.commit()

try:
    _migrate()
except Exception as e:
    print(f"Migration warning: {e}")

app = FastAPI(
    title="Auto Inspection Forms",
    description="自动检验表核对系统",
    version="1.0.0",
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(upload.router)
app.include_router(results.router)
app.include_router(specs.router)
app.include_router(download.router)


@app.get("/")
def root():
    return {"message": "Auto Inspection Forms API", "version": "1.0.0"}


@app.get("/api/health")
def health():
    return {"status": "ok"}
