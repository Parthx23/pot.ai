import time
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from database.models import IssueModel, DetectionRecordModel
from shared.models import IssueStatus
from ai_service.same_issue_matcher import haversine_distance_meters

class ResolutionRecheckEngine:
    def __init__(self, proximity_threshold_meters: float = 25.0):
        self.proximity_threshold_meters = proximity_threshold_meters

    def execute_recheck(
        self,
        db: Session,
        issue_id: str,
        scanned_lat: float,
        scanned_lon: float,
        defect_detected: bool,
        evidence_image_path: Optional[str] = None,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes a resolution re-check against an existing issue:
        If defect is no longer detected at the repaired location, marks the issue RESOLVED!
        If defect is STILL detected, keeps it open / re-escalates.
        """
        issue = db.query(IssueModel).filter(IssueModel.id == issue_id).first()
        if not issue:
            raise ValueError(f"Issue not found: {issue_id}")

        distance = haversine_distance_meters(scanned_lat, scanned_lon, issue.latitude, issue.longitude)
        timestamp = time.time()

        if not defect_detected:
            # CLOSED LOOP COMPLETE: Defect was repaired and confirmed absent!
            issue.status = IssueStatus.RESOLVED.value
            issue.resolution_verified_at = timestamp
            issue.resolution_notes = notes or (
                f"Automated camera re-scan confirmed repair at ({scanned_lat:.5f}, {scanned_lon:.5f}). "
                f"Road surface confirmed smooth and clear ({distance:.1f}m verification proximity). "
                f"Infrastructure issue closed."
            )
            issue.updated_at = timestamp

            # Log recheck record
            det_record = DetectionRecordModel(
                id=f"recheck_{int(timestamp * 1000)}",
                issue_id=issue.id,
                inspection_run_id="recheck_pass",
                timestamp=timestamp,
                confidence=0.0,
                severity="NONE",
                latitude=scanned_lat,
                longitude=scanned_lon,
                bbox_json=None,
                evidence_image_path=evidence_image_path or issue.evidence_image_path,
                vehicle_id=issue.vehicle_id,
                is_recheck=True
            )
            db.add(det_record)
            db.commit()
            db.refresh(issue)

            return {
                "success": True,
                "verifiedResolved": True,
                "issue": issue.to_dict(),
                "message": "Resolution verified successfully! Issue transitioned to RESOLVED."
            }
        else:
            # Defect still persists
            issue.occurrences += 1
            issue.last_seen_at = timestamp
            issue.updated_at = timestamp
            db.commit()
            db.refresh(issue)
            return {
                "success": True,
                "verifiedResolved": False,
                "issue": issue.to_dict(),
                "message": "Defect still detected at site. Repair not confirmed."
            }
