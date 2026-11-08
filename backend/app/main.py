import os
from pathlib import Path
import json
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text
from pypdf import PdfReader

from app.database.connection import engine, Base
from app import models  # noqa: F401 - registers SQLAlchemy models
from app.routes.incidents import router as incidents_router
from app.workflows.rca_graph import run_rca, run_copilot

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env", override=True)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="AIVOA RCA Intelligence",
    description="AI-powered Pharmaceutical Root Cause Analysis",
    version="1.1.0",
)
app.include_router(incidents_router)
frontend_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("FRONTEND_ORIGINS", "").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        *frontend_origins,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class IncidentRequest(BaseModel):
    incident: str


class AnalyzeTextRequest(BaseModel):
    incident_text: str
    analysis_method: str = "5_whys"


class CopilotRequest(BaseModel):
    message: str
    current_data: dict = {}
    analysis_method: str = "5_whys"


def _validate_method(method: str):
    if method not in {"5_whys", "fishbone"}:
        raise HTTPException(status_code=400, detail="analysis_method must be 5_whys or fishbone")


def _analyze(text_content: str, method: str):
    if not text_content.strip():
        raise HTTPException(status_code=400, detail="Please provide incident text or a readable PDF.")
    _validate_method(method)
    try:
        result = run_rca(text_content, method)
        return {"success": True, "analysis": result, "source_text": text_content}
    except Exception as exc:
        print("RCA WORKFLOW ERROR:", repr(exc))
        raise HTTPException(status_code=502, detail="AI analysis failed. Check the backend terminal and Groq configuration.")


@app.get("/")
def home():
    return {"message": "AIVOA RCA Backend Running Successfully"}


@app.get("/api/health")
def health():
    return {"status": "healthy", "model": os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")}


@app.get("/api/db-health")
def database_health():
    try:
        with engine.connect() as connection:
            database_name = connection.execute(text("SELECT current_database()")).scalar()
        return {"status": "connected", "database": database_name, "message": "PostgreSQL connection successful"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/analyze")
def analyze_text(request: AnalyzeTextRequest):
    return _analyze(request.incident_text, request.analysis_method)


@app.post("/api/analyze-file")
async def analyze_file(
    file: UploadFile = File(...),
    analysis_method: str = Form("5_whys"),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a PDF file.")
    try:
        reader = PdfReader(file.file)
        extracted_text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read this PDF. Try a text-based PDF or paste its contents.")
    if not extracted_text.strip():
        raise HTTPException(status_code=400, detail="No selectable text found in this PDF. Please paste the text or use an OCR-readable PDF.")
    result = _analyze(extracted_text, analysis_method)
    result["source_type"] = "pdf"
    result["filename"] = file.filename
    return result


@app.post("/api/copilot")
def copilot(request: CopilotRequest):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Enter an incident description or an update instruction.")
    _validate_method(request.analysis_method)
    try:
        draft = run_copilot(request.message, request.current_data, request.analysis_method)
        return {"success": True, "analysis": draft, "assistant_message": draft.get("assistant_message", "Draft updated.")}
    except Exception as exc:
        print("COPILOT ERROR:", repr(exc))
        raise HTTPException(status_code=502, detail="Copilot could not process the request. Check Groq configuration and backend logs.")


@app.post("/api/copilot-file")
async def copilot_file(
    file: UploadFile = File(...),
    current_data: str = Form("{}"),
    analysis_method: str = Form("5_whys"),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a PDF file.")
    try:
        reader = PdfReader(file.file)
        extracted_text = "\n".join(page.extract_text() or "" for page in reader.pages)
        if not extracted_text.strip():
            raise HTTPException(status_code=400, detail="No selectable text found. Paste the document text instead.")
        existing = json.loads(current_data or "{}")
        draft = run_copilot("Extract the incident details from this uploaded PDF and create/update the RCA draft:\n" + extracted_text[:18000], existing, analysis_method)
        draft["source_type"] = "pdf"
        draft["source_filename"] = file.filename
        return {"success": True, "analysis": draft, "assistant_message": draft.get("assistant_message", "PDF extracted and draft populated.")}
    except HTTPException:
        raise
    except Exception as exc:
        print("COPILOT PDF ERROR:", repr(exc))
        raise HTTPException(status_code=502, detail="Could not extract and analyze this PDF.")


# Kept for compatibility with the earlier Swagger test endpoint.
@app.post("/api/test-ai")
def test_ai(request: IncidentRequest):
    result = _analyze(request.incident, "5_whys")
    return {"success": True, "model": os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"), "analysis": result["analysis"]}
