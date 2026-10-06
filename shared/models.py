from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum
import time

class DefectType(str, Enum):
    POTHOLE_EDGE_BREAK = "POTHOLE_EDGE_BREAK"
    ROAD_CRACK = "ROAD_CRACK"
    ROAD_RAVELLING = "ROAD_RAVELLING"
    ROAD_SUBSIDENCE = "ROAD_SUBSIDENCE"
    PAVEMENT_DEFECT = "PAVEMENT_DEFECT"
    LIGHT_POLE_DAMAGE = "LIGHT_POLE_DAMAGE"
    DIRT_OR_DENT = "DIRT_OR_DENT"
    SURFACE_DEFECT = "SURFACE_DEFECT"
    OTHER_DEFECT = "OTHER_DEFECT"

class IssueStatus(str, Enum):
    NEW = "NEW"
    PENDING_VERIFICATION = "PENDING_VERIFICATION"
    VERIFIED = "VERIFIED"
    ASSIGNED = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    REJECTED = "REJECTED"
    ESCALATED = "ESCALATED"

class PriorityLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class SeverityLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float
    
    @property
    def width(self) -> float:
        return max(0.0, self.x2 - self.x1)
        
    @property
    def height(self) -> float:
        return max(0.0, self.y2 - self.y1)
        
    @property
    def area(self) -> float:
        return self.width * self.height

class NormalizedDetection(BaseModel):
    id: str
    type: DefectType
    confidence: float
    bbox: BoundingBox
    evidenceImage: str
    latitude: float
    longitude: float
    timestamp: float = Field(default_factory=time.time)
    sourceId: str = "camera-dash-01"
    vehicleId: str = "VEH-MUN-402"
    severity: SeverityLevel = SeverityLevel.MEDIUM
    rawClass: Optional[str] = None
    isSimulatedGps: bool = False
    metadata: Dict[str, Any] = Field(default_factory=dict)
