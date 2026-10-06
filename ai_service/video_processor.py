import os
import cv2
import time
import base64
from typing import Dict, Any, List, Optional, Callable
from sqlalchemy.orm import Session
from shared.models import NormalizedDetection, DefectType, SeverityLevel, IssueStatus
from database.models import InspectionRunModel, IssueModel, EscalationLogModel
from ai_service.detector import RoadDefectDetector
from ai_service.gps_adapter import IGPSAdapter, SimulatedVehicleGPSAdapter
from ai_service.spatial_tracker import TemporalFrameTracker
from ai_service.same_issue_matcher import IssueMatchingEngine

class VideoProcessor:
    def __init__(
        self,
        evidence_dir: Optional[str] = None,
        detector: Optional[RoadDefectDetector] = None,
        matching_engine: Optional[IssueMatchingEngine] = None
    ):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.evidence_dir = evidence_dir or os.path.join(base_dir, "uploads", "evidence")
        os.makedirs(self.evidence_dir, exist_ok=True)
        self.detector = detector or RoadDefectDetector()
        self.matching_engine = matching_engine or IssueMatchingEngine()

    def process_video(
        self,
        db: Session,
        video_path: str,
        gps_adapter: IGPSAdapter,
        vehicle_id: str = "VEH-MUN-402",
        source_id: str = "cam-dash-01",
        run_name: str = "Road Inspection Run",
        frame_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
        frame_stride: int = 1
    ) -> Dict[str, Any]:
        """
        Executes end-to-end video processing:
        Frame extraction -> Detection -> Annotation -> Temporal Consolidation ->
        GPS attachment -> Issue matching / creation -> Persistence -> Escalation.
        """
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video file: {video_path}")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        duration_sec = total_frames / fps if total_frames > 0 else 0

        run_id = f"run_{int(time.time() * 1000)}"
        inspection_run = InspectionRunModel(
            id=run_id,
            name=run_name,
            source_type="video",
            source_file=os.path.basename(video_path),
            vehicle_id=vehicle_id,
            total_frames=total_frames,
            processed_frames=0,
            detections_count=0,
            new_issues_count=0,
            matched_issues_count=0,
            status="RUNNING",
            started_at=time.time()
        )
        db.add(inspection_run)
        db.commit()

        temporal_tracker = TemporalFrameTracker(iou_threshold=0.25, max_age_frames=12)
        processed_frames_count = 0
        current_frame_idx = 0
        start_time = time.time()

        created_issues: List[Dict[str, Any]] = []
        matched_issues: List[Dict[str, Any]] = []
        escalations: List[Dict[str, Any]] = []

        all_consolidated_detections: List[NormalizedDetection] = []
        best_frame_cache: Dict[str, np.ndarray] = {}

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            current_frame_idx += 1
            if current_frame_idx % frame_stride != 0:
                continue

            processed_frames_count += 1
            frame_timestamp = start_time + (current_frame_idx / fps)
            lat, lon, is_simulated = gps_adapter.get_coordinates_for_timestamp(frame_timestamp)

            telemetry = {
                "vehicle_id": vehicle_id,
                "speed_kmh": 42.0,
                "lat": lat,
                "lon": lon,
                "is_simulated": is_simulated
            }

            # 1. Run detection on current frame
            detections = self.detector.detect_frame(
                frame=frame,
                latitude=lat,
                longitude=lon,
                timestamp=frame_timestamp,
                source_id=source_id,
                vehicle_id=vehicle_id,
                is_simulated_gps=is_simulated
            )

            # Cache frame for best-detection snapshot
            for d in detections:
                best_frame_cache[d.id] = frame.copy()

            # 2. Update Temporal Frame Tracker
            exited_tracks = temporal_tracker.update(detections, current_frame_idx)
            for det in exited_tracks:
                all_consolidated_detections.append(det)

            # 3. Annotate frame with detections and telemetry HUD
            annotated_frame = self.detector.annotate_frame(frame, detections, telemetry)

            # 4. Stream frame if callback provided
            if frame_callback:
                # Resize for lightweight stream thumbnail (e.g. width 480)
                thumb = cv2.resize(annotated_frame, (480, 270))
                _, buf = cv2.imencode(".jpg", thumb, [cv2.IMWRITE_JPEG_QUALITY, 70])
                b64_frame = base64.b64encode(buf).decode("utf-8")

                frame_callback({
                    "type": "FRAME_UPDATE",
                    "runId": run_id,
                    "frameIndex": current_frame_idx,
                    "totalFrames": total_frames,
                    "progress": round((current_frame_idx / max(1, total_frames)) * 100, 1),
                    "telemetry": telemetry,
                    "detectionsCount": len(detections),
                    "frameImage": f"data:image/jpeg;base64,{b64_frame}",
                    "activeDetections": [d.dict() for d in detections]
                })

            time.sleep(0.01)  # smooth pacing

        cap.release()

        # Flush any remaining active tracks
        final_tracks = temporal_tracker.finalize_all()
        for det in final_tracks:
            all_consolidated_detections.append(det)

        # 5. Process each consolidated detection into issues
        for det in all_consolidated_detections:
            # Retrieve cached raw frame
            source_frame = best_frame_cache.get(det.id, None)
            if source_frame is None:
                source_frame = np.zeros((540, 960, 3), dtype=np.uint8)

            evidence_filename = f"evidence_{det.id}.jpg"
            raw_filename = f"raw_{det.id}.jpg"
            evidence_file_path = os.path.join(self.evidence_dir, evidence_filename)
            raw_file_path = os.path.join(self.evidence_dir, raw_filename)

            # Save raw frame
            cv2.imwrite(raw_file_path, source_frame)

            # Annotate and save evidence frame
            det_annotated = self.detector.annotate_frame(
                source_frame, [det],
                {"vehicle_id": vehicle_id, "lat": det.latitude, "lon": det.longitude, "is_simulated": det.isSimulatedGps}
            )
            cv2.imwrite(evidence_file_path, det_annotated)

            rel_evidence_path = f"/evidence/{evidence_filename}"
            rel_raw_path = f"/evidence/{raw_filename}"

            # Process into Issue Matching Engine
            issue, is_new, escalation = self.matching_engine.process_consolidated_detection(
                db=db,
                detection=det,
                inspection_run_id=run_id,
                evidence_image_path=rel_evidence_path,
                raw_image_path=rel_raw_path
            )

            if is_new:
                created_issues.append(issue.to_dict())
            else:
                matched_issues.append(issue.to_dict())

            if escalation:
                escalations.append(escalation.to_dict())

        # Update Inspection Run
        inspection_run.processed_frames = processed_frames_count
        inspection_run.detections_count = len(all_consolidated_detections)
        inspection_run.new_issues_count = len(created_issues)
        inspection_run.matched_issues_count = len(matched_issues)
        inspection_run.status = "COMPLETED"
        inspection_run.completed_at = time.time()
        db.commit()

        result = {
            "runId": run_id,
            "status": "COMPLETED",
            "totalFrames": total_frames,
            "processedFrames": processed_frames_count,
            "consolidatedDetections": len(all_consolidated_detections),
            "newIssues": created_issues,
            "matchedIssues": matched_issues,
            "escalations": escalations,
            "summary": {
                "newCount": len(created_issues),
                "matchedCount": len(matched_issues),
                "escalatedCount": len(escalations)
            }
        }

        if frame_callback:
            frame_callback({
                "type": "RUN_COMPLETED",
                "runId": run_id,
                "result": result
            })

        return result
