import time
import json
from sqlalchemy import Column, String, Integer, Float, Boolean, Text, ForeignKey
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class IssueModel(Base):
    __tablename__ = "issues"

    id = Column(String(64), primary_key=True)
    code = Column(String(32), unique=True, index=True)
    type = Column(String(64), index=True)
    title = Column(String(255))
    status = Column(String(32), default="PENDING_VERIFICATION", index=True)
    severity = Column(String(32), default="MEDIUM")
    priority = Column(String(32), default="MEDIUM")
    priority_score = Column(Float, default=50.0)
    priority_reason = Column(Text, default="")
    
    latitude = Column(Float, nullable=False, index=True)
    longitude = Column(Float, nullable=False, index=True)
    location_name = Column(String(255), default="Route 101 Road Corridor")
    is_simulated_gps = Column(Boolean, default=False)
    
    confidence = Column(Float, default=0.85)
    occurrences = Column(Integer, default=1)
    first_seen_at = Column(Float, default=time.time)
    last_seen_at = Column(Float, default=time.time)
    
    source_id = Column(String(64), default="cam-vehicle-01")
    vehicle_id = Column(String(64), default="VEH-MUN-402")
    evidence_image_path = Column(String(512), nullable=True)
    raw_evidence_image_path = Column(String(512), nullable=True)
    bbox_json = Column(Text, nullable=True)
    
    verified_by = Column(String(128), nullable=True)
    verified_at = Column(Float, nullable=True)
    assigned_to = Column(String(128), nullable=True)
    resolution_verified_at = Column(Float, nullable=True)
    resolution_notes = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    
    created_at = Column(Float, default=time.time)
    updated_at = Column(Float, default=time.time)

    detections = relationship("DetectionRecordModel", back_populates="issue", cascade="all, delete-orphan")
    escalations = relationship("EscalationLogModel", back_populates="issue", cascade="all, delete-orphan")

    def to_dict(self):
        bbox = json.loads(self.bbox_json) if self.bbox_json else None
        return {
            "id": self.id,
            "code": self.code,
            "type": self.type,
            "title": self.title,
            "status": self.status,
            "severity": self.severity,
            "priority": self.priority,
            "priorityScore": round(self.priority_score, 1),
            "priorityReason": self.priority_reason,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "locationName": self.location_name,
            "isSimulatedGps": self.is_simulated_gps,
            "confidence": round(self.confidence, 3),
            "occurrences": self.occurrences,
            "firstSeenAt": self.first_seen_at,
            "lastSeenAt": self.last_seen_at,
            "sourceId": self.source_id,
            "vehicleId": self.vehicle_id,
            "evidenceImagePath": self.evidence_image_path,
            "rawEvidenceImagePath": self.raw_evidence_image_path,
            "bbox": bbox,
            "verifiedBy": self.verified_by,
            "verifiedAt": self.verified_at,
            "assignedTo": self.assigned_to,
            "resolutionVerifiedAt": self.resolution_verified_at,
            "resolutionNotes": self.resolution_notes,
            "notes": self.notes,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }

class DetectionRecordModel(Base):
    __tablename__ = "detections"

    id = Column(String(64), primary_key=True)
    issue_id = Column(String(64), ForeignKey("issues.id"), index=True)
    inspection_run_id = Column(String(64), index=True)
    frame_index = Column(Integer, default=0)
    timestamp = Column(Float, default=time.time)
    confidence = Column(Float, default=0.0)
    severity = Column(String(32), default="MEDIUM")
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    bbox_json = Column(Text, nullable=True)
    evidence_image_path = Column(String(512), nullable=True)
    vehicle_id = Column(String(64), default="VEH-MUN-402")
    is_recheck = Column(Boolean, default=False)

    issue = relationship("IssueModel", back_populates="detections")

    def to_dict(self):
        bbox = json.loads(self.bbox_json) if self.bbox_json else None
        return {
            "id": self.id,
            "issueId": self.issue_id,
            "inspectionRunId": self.inspection_run_id,
            "frameIndex": self.frame_index,
            "timestamp": self.timestamp,
            "confidence": round(self.confidence, 3),
            "severity": self.severity,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "bbox": bbox,
            "evidenceImagePath": self.evidence_image_path,
            "vehicleId": self.vehicle_id,
            "isRecheck": self.is_recheck,
        }

class InspectionRunModel(Base):
    __tablename__ = "inspection_runs"

    id = Column(String(64), primary_key=True)
    name = Column(String(255))
    source_type = Column(String(32), default="video")
    source_file = Column(String(512), nullable=True)
    vehicle_id = Column(String(64), default="VEH-MUN-402")
    total_frames = Column(Integer, default=0)
    processed_frames = Column(Integer, default=0)
    detections_count = Column(Integer, default=0)
    new_issues_count = Column(Integer, default=0)
    matched_issues_count = Column(Integer, default=0)
    status = Column(String(32), default="RUNNING")
    started_at = Column(Float, default=time.time)
    completed_at = Column(Float, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "sourceType": self.source_type,
            "sourceFile": self.source_file,
            "vehicleId": self.vehicle_id,
            "totalFrames": self.total_frames,
            "processedFrames": self.processed_frames,
            "detectionsCount": self.detections_count,
            "newIssuesCount": self.new_issues_count,
            "matchedIssuesCount": self.matched_issues_count,
            "status": self.status,
            "startedAt": self.started_at,
            "completedAt": self.completed_at,
        }

class EscalationLogModel(Base):
    __tablename__ = "escalation_logs"

    id = Column(String(64), primary_key=True)
    issue_id = Column(String(64), ForeignKey("issues.id"), index=True)
    issue_code = Column(String(32))
    occurrence_count = Column(Integer, default=3)
    level = Column(String(32), default="PERSISTENT")
    title = Column(String(255))
    description = Column(Text)
    created_at = Column(Float, default=time.time)
    acknowledged = Column(Boolean, default=False)

    issue = relationship("IssueModel", back_populates="escalations")

    def to_dict(self):
        return {
            "id": self.id,
            "issueId": self.issue_id,
            "issueCode": self.issue_code,
            "occurrenceCount": self.occurrence_count,
            "level": self.level,
            "title": self.title,
            "description": self.description,
            "createdAt": self.created_at,
            "acknowledged": self.acknowledged,
        }
