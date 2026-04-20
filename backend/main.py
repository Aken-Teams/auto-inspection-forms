"""FastAPI application entry point."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, Base
from routers import upload, results, specs, download

# Create tables
Base.metadata.create_all(bind=engine)

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
