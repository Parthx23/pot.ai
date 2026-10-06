import math
import time
import json
from typing import Optional, Tuple, List
from sqlalchemy.orm import Session
from database.models import IssueModel, DetectionRecordModel, EscalationLogModel
from shared.models import NormalizedDetection, DefectType, SeverityLevel, IssueStatus, PriorityLevel
from ai_service.priority_engine import calculate_priority_score

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0  # Earth's radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

ROAD_SURFACE_TYPES = {
    DefectType.POTHOLE_EDGE_BREAK.value,
    DefectType.ROAD_CRACK.value,
    DefectType.ROAD_RAVELLING.value,
    DefectType.ROAD_SUBSIDENCE.value,
    DefectType.PAVEMENT_DEFECT.value,
}

def are_types_compatible(type1: str, type2: str) -> bool:
    if type1 == type2:
        return True
    if type1 in ROAD_SURFACE_TYPES and type2 in ROAD_SURFACE_TYPES:
        return True
    return False


class IssueMatchingEngine:
    def __init__(self, proximity_threshold_meters: float = 22.0):
        self.proximity_threshold_meters = proximity_threshold_meters

    def find_matching_issue(
        self,
        db: Session,
        latitude: float,
        longitude: float,
        defect_type: str,
        exclude_resolved: bool = True
    ) -> Optional[IssueModel]:
        """
        Searches active issues to find a physical match within the proximity threshold.
        """
        query = db.query(IssueModel)
        if exclude_resolved:
            query = query.filter(IssueModel.status != IssueStatus.RESOLVED.value)
        
        candidates = query.all()
        best_match = None
        min_dist = float("inf")

        for issue in candidates:
            dist = haversine_distance_meters(latitude, longitude, issue.latitude, issue.longitude)
            if dist <= self.proximity_threshold_meters and are_types_compatible(defect_type, issue.type):
                if dist < min_dist:
                    min_dist = dist
                    best_match = issue

        return best_match

    def process_consolidated_detection(
        self,
        db: Session,
        detection: NormalizedDetection,
        inspection_run_id: str,
        evidence_image_path: str,
        raw_image_path: Optional[str] = None
    ) -> Tuple[IssueModel, bool, Optional[EscalationLogModel]]:
        """
        Processes a consolidated detection:
        - If matched to existing issue within proximity radius:
            Increments occurrences, recalculates priority, triggers escalation if >= 3 passes.
        - If new:
            Creates new Issue record.
        Returns (issue, is_new, escalation_log_if_triggered).
        """
        existing_issue = self.find_matching_issue(
            db, detection.latitude, detection.longitude, detection.type.value
        )

        bbox_json = json.dumps({
            "x1": detection.bbox.x1,
            "y1": detection.bbox.y1,
            "x2": detection.bbox.x2,
            "y2": detection.bbox.y2
        })

        if existing_issue:
            # Repeat detection of the same physical defect!
            is_new = False

            # Determine if this detection is an independent pass or the same continuous observation
            last_record = (
                db.query(DetectionRecordModel)
                .filter(DetectionRecordModel.issue_id == existing_issue.id)
                .order_by(DetectionRecordModel.timestamp.desc())
                .first()
            )

            is_distinct_pass = False
            if last_record is None:
                is_distinct_pass = False
            elif str(inspection_run_id).startswith("live_camera"):
                # For continuous live camera (static mode or same patrol view),
                # do NOT increment occurrences while pointing at the same pothole.
                # Only count as a new pass if the defect has NOT been seen for > 45 seconds (vehicle circled back).
                time_since_last = detection.timestamp - existing_issue.last_seen_at
                if time_since_last > 45.0:
                    is_distinct_pass = True
            else:
                # For batch videos / scheduled passes: only increment if the run ID is different
                # (e.g. pass_1 vs pass_2 vs pass_3)
                if last_record.inspection_run_id != inspection_run_id:
                    is_distinct_pass = True

            if is_distinct_pass:
                existing_issue.occurrences += 1

            existing_issue.last_seen_at = detection.timestamp
            
            # Update evidence if this new detection has higher confidence
            if detection.confidence > existing_issue.confidence:
                existing_issue.confidence = detection.confidence
                if evidence_image_path:
                    existing_issue.evidence_image_path = evidence_image_path
                existing_issue.bbox_json = bbox_json

            # Recalculate priority score with occurrence boost
            age_days = (detection.timestamp - existing_issue.first_seen_at) / 86400.0
            p_level, p_score, p_reason = calculate_priority_score(
                severity=SeverityLevel(existing_issue.severity),
                defect_type=DefectType(existing_issue.type),
                occurrences=existing_issue.occurrences,
                confidence=existing_issue.confidence,
                age_days=age_days
            )
            existing_issue.priority = p_level.value
            existing_issue.priority_score = p_score
            existing_issue.priority_reason = p_reason
            existing_issue.updated_at = time.time()

            escalation_triggered = None
            # Check for Escalation threshold (only on distinct passes reaching >= 3)
            if existing_issue.occurrences >= 3 and is_distinct_pass:
                existing_issue.status = IssueStatus.ESCALATED.value
                existing_issue.priority = PriorityLevel.CRITICAL.value

                # Create Escalation Record
                escalation_id = f"esc_{int(time.time() * 1000)}"
                escalation = EscalationLogModel(
                    id=escalation_id,
                    issue_id=existing_issue.id,
                    issue_code=existing_issue.code,
                    occurrence_count=existing_issue.occurrences,
                    level="PERSISTENT_CRITICAL",
                    title=f"AUTOMATED ESCALATION: Unresolved Infrastructure Defect {existing_issue.code}",
                    description=(
                        f"Physical defect {existing_issue.title} was re-detected across "
                        f"{existing_issue.occurrences} independent vehicle inspection passes without repair. "
                        f"Priority automatically elevated to CRITICAL. Escalated to Municipal Operations Superintendent."
                    ),
                    created_at=time.time(),
                    acknowledged=False
                )
                db.add(escalation)
                escalation_triggered = escalation
            
            # Save detection record in history only on distinct passes or if no previous record exists
            if is_distinct_pass or last_record is None:
                det_record = DetectionRecordModel(
                    id=detection.id,
                    issue_id=existing_issue.id,
                    inspection_run_id=inspection_run_id,
                    timestamp=detection.timestamp,
                    confidence=detection.confidence,
                    severity=detection.severity.value,
                    latitude=detection.latitude,
                    longitude=detection.longitude,
                    bbox_json=bbox_json,
                    evidence_image_path=evidence_image_path,
                    vehicle_id=detection.vehicleId,
                    is_recheck=False
                )
                db.add(det_record)

            db.commit()
            db.refresh(existing_issue)
            return existing_issue, is_new, escalation_triggered

        else:
            # Brand new issue!
            is_new = True
            # Compute readable code (e.g. INF-101)
            total_issues = db.query(IssueModel).count()
            issue_code = f"INF-{101 + total_issues}"
            issue_id = f"iss_{int(time.time() * 1000)}_{np_random_suffix()}"

            display_title = detection.metadata.get(
                "displayName", detection.type.value.replace("_", " ").title()
            )

            p_level, p_score, p_reason = calculate_priority_score(
                severity=detection.severity,
                defect_type=detection.type,
                occurrences=1,
                confidence=detection.confidence,
                age_days=0.0
            )

            new_issue = IssueModel(
                id=issue_id,
                code=issue_code,
                type=detection.type.value,
                title=f"{display_title} at Mile Marker",
                status=IssueStatus.PENDING_VERIFICATION.value,
                severity=detection.severity.value,
                priority=p_level.value,
                priority_score=p_score,
                priority_reason=p_reason,
                latitude=detection.latitude,
                longitude=detection.longitude,
                location_name=f"Route 101 corridor (Near KM {14.2 + (total_issues * 0.4):.1f})",
                is_simulated_gps=detection.isSimulatedGps,
                confidence=detection.confidence,
                occurrences=1,
                first_seen_at=detection.timestamp,
                last_seen_at=detection.timestamp,
                source_id=detection.sourceId,
                vehicle_id=detection.vehicleId,
                evidence_image_path=evidence_image_path,
                raw_evidence_image_path=raw_image_path,
                bbox_json=bbox_json,
                created_at=time.time(),
                updated_at=time.time()
            )
            db.add(new_issue)

            det_record = DetectionRecordModel(
                id=detection.id,
                issue_id=issue_id,
                inspection_run_id=inspection_run_id,
                timestamp=detection.timestamp,
                confidence=detection.confidence,
                severity=detection.severity.value,
                latitude=detection.latitude,
                longitude=detection.longitude,
                bbox_json=bbox_json,
                evidence_image_path=evidence_image_path,
                vehicle_id=detection.vehicleId,
                is_recheck=False
            )
            db.add(det_record)
            db.commit()
            db.refresh(new_issue)
            return new_issue, is_new, None

def np_random_suffix() -> int:
    import random
    return random.randint(100, 999)
