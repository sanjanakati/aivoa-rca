from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from sqlalchemy.sql import func
from app.database.connection import Base


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    source_type = Column(String(50), default="text")
    rca_analysis = Column(JSON, nullable=True)
    status = Column(String(50), default="Under Review")
    created_at = Column(DateTime(timezone=True), server_default=func.now())