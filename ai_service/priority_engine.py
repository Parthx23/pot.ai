from typing import Tuple, Dict, Any
from shared.models import SeverityLevel, DefectType, PriorityLevel

# Base severity weights (0 - 45 points)
SEVERITY_WEIGHTS = {
    SeverityLevel.CRITICAL: 45.0,
    SeverityLevel.HIGH: 35.0,
    SeverityLevel.MEDIUM: 22.0,
    SeverityLevel.LOW: 10.0,
}

# Defect inherent risk weights (0 - 25 points)
DEFECT_RISK_WEIGHTS = {
    DefectType.POTHOLE_EDGE_BREAK: 25.0,  # High hazard to tires and vehicle safety
    DefectType.ROAD_SUBSIDENCE: 22.0,      # High hazard at speed
    DefectType.LIGHT_POLE_DAMAGE: 20.0,    # Fall / electrical hazard
    DefectType.ROAD_CRACK: 16.0,          # Water ingress damage risk
    DefectType.ROAD_RAVELLING: 14.0,       # Surface friction loss
    DefectType.PAVEMENT_DEFECT: 12.0,      # Pedestrian trip hazard
    DefectType.DIRT_OR_DENT: 8.0,
    DefectType.SURFACE_DEFECT: 6.0,
    DefectType.OTHER_DEFECT: 5.0,
}

def calculate_priority_score(
    severity: SeverityLevel,
    defect_type: DefectType,
    occurrences: int,
    confidence: float,
    age_days: float = 0.0,
    traffic_risk_factor: float = 1.0
) -> Tuple[PriorityLevel, float, str]:
    """
    Computes an explainable rule-based priority score between 0.0 and 100.0.
    Returns (PriorityLevel, score, explanation).
    """
    severity_pts = SEVERITY_WEIGHTS.get(severity, 20.0)
    risk_pts = DEFECT_RISK_WEIGHTS.get(defect_type, 10.0)
    
    # Occurrences boost: +12 points per repeat observation up to +30 points
    occurrence_bonus = min(30.0, max(0, occurrences - 1) * 12.0)
    
    # AI confidence weighting: up to 10 points
    confidence_pts = min(10.0, confidence * 10.0)
    
    # Unresolved age factor: +2 points per day up to 15 points
    age_pts = min(15.0, age_days * 2.0)
    
    # Raw aggregate
    raw_score = (severity_pts + risk_pts + occurrence_bonus + confidence_pts + age_pts) * traffic_risk_factor
    score = min(100.0, max(0.0, round(raw_score, 1)))

    # Classification boundaries
    if score >= 75.0 or occurrences >= 3:
        level = PriorityLevel.CRITICAL
    elif score >= 55.0:
        level = PriorityLevel.HIGH
    elif score >= 35.0:
        level = PriorityLevel.MEDIUM
    else:
        level = PriorityLevel.LOW

    # Transparent human-readable explanation
    reasons = [
        f"Severity [{severity.value}]: +{severity_pts:.0f} pts",
        f"Hazard Category [{defect_type.value}]: +{risk_pts:.0f} pts",
    ]
    if occurrence_bonus > 0:
        reasons.append(f"Persistence ({occurrences} repeat passes): +{occurrence_bonus:.0f} pts")
    if age_pts > 0:
        reasons.append(f"Unresolved Age ({age_days:.1f} days): +{age_pts:.0f} pts")
    reasons.append(f"AI Detection Confidence ({confidence * 100:.0f}%): +{confidence_pts:.1f} pts")

    explanation = " | ".join(reasons)
    return level, score, explanation
