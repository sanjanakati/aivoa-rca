from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models import Incident

router = APIRouter(prefix="/api/incidents", tags=["Incidents"])


class IncidentCreate(BaseModel):
    title: str
    description: str
    source_type: str = "text"
    rca_analysis: dict | None = None


@router.post("/")
def create_incident(data: IncidentCreate, db: Session = Depends(get_db)):
    incident = Incident(
        title=data.title,
        description=data.description,
        source_type=data.source_type,
        rca_analysis=data.rca_analysis,
        status="Under Review"
    )

    db.add(incident)
    db.commit()
    db.refresh(incident)

    return {
        "message": "Incident saved successfully",
        "incident_id": incident.id,
        "title": incident.title,
        "status": incident.status
    }


@router.get("/")
def get_incidents(db: Session = Depends(get_db)):
    incidents = db.query(Incident).order_by(Incident.id.desc()).all()

    return [
        {
            "id": item.id,
            "title": item.title,
            "description": item.description,
            "source_type": item.source_type,
            "rca_analysis": item.rca_analysis,
            "status": item.status,
            "created_at": item.created_at
        }
        for item in incidents
    ]


@router.get("/{incident_id}")
def get_incident(incident_id: int, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(
        Incident.id == incident_id
    ).first()

    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    return {
        "id": incident.id,
        "title": incident.title,
        "description": incident.description,
        "source_type": incident.source_type,
        "rca_analysis": incident.rca_analysis,
        "status": incident.status,
        "created_at": incident.created_at
    }