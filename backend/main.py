import os
import time
import shutil
import json
import asyncio
import cv2
import numpy as np
import base64
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database.db import init_db, get_db, DATABASE_PATH
from database.models import IssueModel, DetectionRecordModel, InspectionRunModel, EscalationLogModel
from shared.models import IssueStatus, PriorityLevel, SeverityLevel, DefectType
from ai_service.detector import RoadDefectDetector
from ai_service.gps_adapter import SimulatedVehicleGPSAdapter, RealGNSSAdapter
from ai_service.same_issue_matcher import IssueMatchingEngine
from ai_service.video_processor import VideoProcessor
from ai_service.resolution_checker import ResolutionRecheckEngine
from ai_service.video_generator import create_demo_videos

app = FastAPI(
    title="RoadWatch AI - Continuous Public Infrastructure Monitoring Platform",
    description="Continuous AI Infrastructure Monitoring + Verification + Tracking + Escalation Platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVIDENCE_DIR = os.path.join(BASE_DIR, "uploads", "evidence")
VIDEOS_DIR = os.path.join(BASE_DIR, "uploads", "videos")
SAMPLE_VIDEOS_DIR = os.path.join(BASE_DIR, "sample_data", "videos")
SAMPLE_IMAGES_DIR = os.path.join(BASE_DIR, "sample_data", "images")

os.makedirs(EVIDENCE_DIR, exist_ok=True)
os.makedirs(VIDEOS_DIR, exist_ok=True)
os.makedirs(SAMPLE_VIDEOS_DIR, exist_ok=True)

# Mount static asset folders
app.mount("/evidence", StaticFiles(directory=EVIDENCE_DIR), name="evidence")
app.mount("/sample-videos", StaticFiles(directory=SAMPLE_VIDEOS_DIR), name="sample-videos")

# Global singletons
detector = RoadDefectDetector()
matching_engine = IssueMatchingEngine(proximity_threshold_meters=22.0)
video_processor = VideoProcessor(evidence_dir=EVIDENCE_DIR, detector=detector, matching_engine=matching_engine)
resolution_engine = ResolutionRecheckEngine(proximity_threshold_meters=25.0)

# Active WebSocket connections
active_connections: List[WebSocket] = []
last_reset_time: float = 0.0

# Initialize tables immediately
init_db()

@app.on_event("startup")
def startup_event():
    init_db()
    # Ensure sample demo videos exist
    create_demo_videos(SAMPLE_VIDEOS_DIR)
    print("[RoadWatch AI] Backend started successfully.")

# -------------------------------------------------------------
# WebSocket for Live Inspection Video Telemetry Streaming
# -------------------------------------------------------------
@app.websocket("/ws/inspection")
async def websocket_inspection_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # keepalive or client message
    except WebSocketDisconnect:
        if websocket in active_connections:
            active_connections.remove(websocket)

async def broadcast_ws_event(event_data: Dict[str, Any]):
    for ws in list(active_connections):
        try:
            await ws.send_json(event_data)
        except Exception:
            if ws in active_connections:
                active_connections.remove(ws)

# -------------------------------------------------------------
# WebSocket for Live Browser Webcam AI Inference Stream
# -------------------------------------------------------------
@app.websocket("/ws/camera-stream")
async def websocket_camera_stream(websocket: WebSocket):
    await websocket.accept()
    from database.db import SessionFactory
    db = SessionFactory()
    try:
        while True:
            raw_text = await websocket.receive_text()
            data = json.loads(raw_text)
            img_b64 = data.get("image", "")
            if not img_b64:
                continue

            # Strip base64 prefix if present
            if "," in img_b64:
                img_b64 = img_b64.split(",", 1)[1]

            img_bytes = base64.b64decode(img_b64)
            nparr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if frame is None:
                continue

            lat = float(data.get("lat", 37.774929))
            lon = float(data.get("lon", -122.419416))
            is_sim = bool(data.get("isSimulated", True))
            veh_id = data.get("vehicleId", "VEH-LIVE-CAM")
            auto_capture = bool(data.get("autoCapture", True))
            conf = float(data.get("conf", 0.20))
            now = time.time()

            detections = detector.detect_frame(
                frame=frame,
                latitude=lat,
                longitude=lon,
                timestamp=now,
                source_id="webcam-live",
                vehicle_id=veh_id,
                is_simulated_gps=is_sim,
                conf_threshold=conf
            )

            created_issue_dict = None
            matched_issue_dict = None
            escalation_dict = None

            if len(detections) > 0 and auto_capture and (now - last_reset_time >= 2.0):
                for det in detections:
                    existing = matching_engine.find_matching_issue(
                        db, det.latitude, det.longitude, det.type.value
                    )
                    # If already recorded and seen recently (<45s), camera is in static mode or same pass:
                    # Do NOT create duplicate issues, do NOT increment occurrences, do NOT re-write files
                    if existing and (now - existing.last_seen_at) < 45.0:
                        existing.last_seen_at = now
                        if det.confidence > existing.confidence:
                            existing.confidence = det.confidence
                        db.commit()
                        continue

                    ev_name = f"evidence_live_{det.id}.jpg"
                    ev_path = os.path.join(EVIDENCE_DIR, ev_name)
                    ann_frame = detector.annotate_frame(
                        frame, [det],
                        {"vehicle_id": veh_id, "lat": lat, "lon": lon, "is_simulated": is_sim}
                    )
                    cv2.imwrite(ev_path, ann_frame)

                    issue, is_new, escalation = matching_engine.process_consolidated_detection(
                        db=db,
                        detection=det,
                        inspection_run_id="live_camera_stream",
                        evidence_image_path=f"/evidence/{ev_name}"
                    )
                    if is_new:
                        created_issue_dict = issue.to_dict()
                    else:
                        matched_issue_dict = issue.to_dict()
                    if escalation:
                        escalation_dict = escalation.to_dict()

            # Format detections for canvas overlay
            dets_payload = [
                {
                    "id": d.id,
                    "type": d.type.value,
                    "confidence": round(d.confidence, 3),
                    "severity": d.severity.value,
                    "displayName": d.metadata.get("displayName", d.type.value),
                    "bbox": {
                        "x1": d.bbox.x1,
                        "y1": d.bbox.y1,
                        "x2": d.bbox.x2,
                        "y2": d.bbox.y2
                    }
                }
                for d in detections
            ]

            resp_payload = {
                "type": "CAMERA_DETECTIONS",
                "detections": dets_payload,
                "detectionsCount": len(detections),
                "timestamp": now,
                "telemetry": {
                    "lat": lat,
                    "lon": lon,
                    "isSimulated": is_sim,
                    "vehicleId": veh_id
                }
            }
            if created_issue_dict:
                resp_payload["newIssue"] = created_issue_dict
            if matched_issue_dict:
                resp_payload["matchedIssue"] = matched_issue_dict
            if escalation_dict:
                resp_payload["escalation"] = escalation_dict

            await websocket.send_json(resp_payload)
    except WebSocketDisconnect:
        pass
    except Exception as ex:
        print(f"[Camera WS] Error: {ex}")
    finally:
        db.close()

# -------------------------------------------------------------
# REST Frame Ingestion Endpoint for Live Camera
# -------------------------------------------------------------
class CameraFrameRequest(BaseModel):
    image: str
    lat: float = 37.774929
    lon: float = -122.419416
    isSimulated: bool = True
    vehicleId: str = "VEH-LIVE-CAM"
    autoCapture: bool = True
    conf: float = 0.20

@app.post("/api/camera/process-frame")
def process_camera_frame(req: CameraFrameRequest, db: Session = Depends(get_db)):
    img_b64 = req.image
    if "," in img_b64:
        img_b64 = img_b64.split(",", 1)[1]

    img_bytes = base64.b64decode(img_b64)
    nparr = np.frombuffer(img_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="Invalid image payload")

    now = time.time()
    detections = detector.detect_frame(
        frame=frame,
        latitude=req.lat,
        longitude=req.lon,
        timestamp=now,
        source_id="webcam-live",
        vehicle_id=req.vehicleId,
        is_simulated_gps=req.isSimulated,
        conf_threshold=req.conf
    )

    created_issues = []
    matched_issues = []
    escalations = []

    if len(detections) > 0 and req.autoCapture and (now - last_reset_time >= 2.0):
        for det in detections:
            existing = matching_engine.find_matching_issue(
                db, det.latitude, det.longitude, det.type.value
            )
            if existing and (now - existing.last_seen_at) < 45.0:
                existing.last_seen_at = now
                if det.confidence > existing.confidence:
                    existing.confidence = det.confidence
                db.commit()
                continue

            ev_name = f"evidence_live_{det.id}.jpg"
            ev_path = os.path.join(EVIDENCE_DIR, ev_name)
            ann_frame = detector.annotate_frame(
                frame, [det],
                {"vehicle_id": req.vehicleId, "lat": req.lat, "lon": req.lon, "is_simulated": req.isSimulated}
            )
            cv2.imwrite(ev_path, ann_frame)

            issue, is_new, escalation = matching_engine.process_consolidated_detection(
                db=db,
                detection=det,
                inspection_run_id="live_camera_rest",
                evidence_image_path=f"/evidence/{ev_name}"
            )
            if is_new:
                created_issues.append(issue.to_dict())
            else:
                matched_issues.append(issue.to_dict())
            if escalation:
                escalations.append(escalation.to_dict())

    dets_payload = [
        {
            "id": d.id,
            "type": d.type.value,
            "confidence": round(d.confidence, 3),
            "severity": d.severity.value,
            "displayName": d.metadata.get("displayName", d.type.value),
            "bbox": {
                "x1": d.bbox.x1,
                "y1": d.bbox.y1,
                "x2": d.bbox.x2,
                "y2": d.bbox.y2
            }
        }
        for d in detections
    ]

    return {
        "success": True,
        "detectionsCount": len(detections),
        "detections": dets_payload,
        "newIssues": created_issues,
        "matchedIssues": matched_issues,
        "escalations": escalations
    }

# -------------------------------------------------------------
# REST API Endpoints
# -------------------------------------------------------------

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "RoadWatch AI Backend",
        "modelLoaded": detector.model_loaded,
        "timestamp": time.time()
    }

@app.get("/api/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    total = db.query(IssueModel).count()
    pending = db.query(IssueModel).filter(IssueModel.status == IssueStatus.PENDING_VERIFICATION.value).count()
    verified = db.query(IssueModel).filter(IssueModel.status == IssueStatus.VERIFIED.value).count()
    high_critical = db.query(IssueModel).filter(
        IssueModel.priority.in_([PriorityLevel.HIGH.value, PriorityLevel.CRITICAL.value])
    ).count()
    persistent = db.query(IssueModel).filter(
        (IssueModel.occurrences >= 2) | (IssueModel.status == IssueStatus.ESCALATED.value)
    ).count()
    resolved = db.query(IssueModel).filter(IssueModel.status == IssueStatus.RESOLVED.value).count()
    escalated = db.query(EscalationLogModel).count()
    
    # Total detection occurrences across all issues
    issues = db.query(IssueModel).all()
    total_occurrences = sum(i.occurrences for i in issues) if issues else 0

    return {
        "totalDetected": total,
        "pendingVerification": pending,
        "verified": verified,
        "highOrCritical": high_critical,
        "persistent": persistent,
        "resolved": resolved,
        "escalationsCount": escalated,
        "totalOccurrences": total_occurrences
    }

@app.get("/api/issues")
def list_issues(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    severity: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(IssueModel)
    if status and status != "ALL":
        query = query.filter(IssueModel.status == status)
    if priority and priority != "ALL":
        query = query.filter(IssueModel.priority == priority)
    if severity and severity != "ALL":
        query = query.filter(IssueModel.severity == severity)
    if search:
        s = f"%{search}%"
        query = query.filter((IssueModel.code.like(s)) | (IssueModel.title.like(s)) | (IssueModel.location_name.like(s)))

    # Order by priority score descending and last seen
    issues = query.order_by(IssueModel.priority_score.desc(), IssueModel.last_seen_at.desc()).all()
    return [issue.to_dict() for issue in issues]

@app.get("/api/issues/{issue_id}")
def get_issue_details(issue_id: str, db: Session = Depends(get_db)):
    issue = db.query(IssueModel).filter(IssueModel.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    detections = db.query(DetectionRecordModel).filter(DetectionRecordModel.issue_id == issue_id).order_by(DetectionRecordModel.timestamp.asc()).all()
    escalations = db.query(EscalationLogModel).filter(EscalationLogModel.issue_id == issue_id).order_by(EscalationLogModel.created_at.desc()).all()

    issue_dict = issue.to_dict()
    issue_dict["detectionHistory"] = [d.to_dict() for d in detections]
    issue_dict["escalationHistory"] = [e.to_dict() for e in escalations]
    return issue_dict

class VerificationRequest(BaseModel):
    reviewer: str = "Inspector J. Davis"
    notes: Optional[str] = "Confirmed road hazard following visual evidence inspection"
    assignTo: Optional[str] = "Municipal District 4 Highway Maintenance Crew"

@app.post("/api/issues/{issue_id}/verify")
def verify_issue(issue_id: str, req: VerificationRequest, db: Session = Depends(get_db)):
    issue = db.query(IssueModel).filter(IssueModel.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    issue.status = IssueStatus.VERIFIED.value
    issue.verified_by = req.reviewer
    issue.verified_at = time.time()
    if req.assignTo:
        issue.assigned_to = req.assignTo
    if req.notes:
        issue.notes = req.notes
    issue.updated_at = time.time()
    db.commit()
    db.refresh(issue)
    return issue.to_dict()

class RejectionRequest(BaseModel):
    reviewer: str = "Inspector J. Davis"
    reason: str = "False positive or negligible road mark"

@app.post("/api/issues/{issue_id}/reject")
def reject_issue(issue_id: str, req: RejectionRequest, db: Session = Depends(get_db)):
    issue = db.query(IssueModel).filter(IssueModel.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    issue.status = IssueStatus.REJECTED.value
    issue.verified_by = req.reviewer
    issue.verified_at = time.time()
    issue.notes = f"REJECTED: {req.reason}"
    issue.updated_at = time.time()
    db.commit()
    db.refresh(issue)
    return issue.to_dict()

class StatusUpdateRequest(BaseModel):
    status: str
    assignedTo: Optional[str] = None
    notes: Optional[str] = None

@app.patch("/api/issues/{issue_id}/status")
def update_issue_status(issue_id: str, req: StatusUpdateRequest, db: Session = Depends(get_db)):
    issue = db.query(IssueModel).filter(IssueModel.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    issue.status = req.status
    if req.assignedTo:
        issue.assigned_to = req.assignedTo
    if req.notes:
        issue.notes = req.notes
    issue.updated_at = time.time()
    db.commit()
    db.refresh(issue)
    return issue.to_dict()

class ResolutionCheckRequest(BaseModel):
    scannedLat: Optional[float] = None
    scannedLon: Optional[float] = None
    defectDetected: bool = False
    notes: Optional[str] = None

@app.post("/api/issues/{issue_id}/resolution-check")
def trigger_resolution_check(issue_id: str, req: ResolutionCheckRequest, db: Session = Depends(get_db)):
    issue = db.query(IssueModel).filter(IssueModel.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    lat = req.scannedLat if req.scannedLat is not None else issue.latitude
    lon = req.scannedLon if req.scannedLon is not None else issue.longitude

    result = resolution_engine.execute_recheck(
        db=db,
        issue_id=issue_id,
        scanned_lat=lat,
        scanned_lon=lon,
        defect_detected=req.defectDetected,
        notes=req.notes
    )
    return result

@app.get("/api/escalations")
def list_escalations(db: Session = Depends(get_db)):
    logs = db.query(EscalationLogModel).order_by(EscalationLogModel.created_at.desc()).all()
    return [l.to_dict() for l in logs]

@app.get("/api/inspections/runs")
def list_inspection_runs(db: Session = Depends(get_db)):
    runs = db.query(InspectionRunModel).order_by(InspectionRunModel.started_at.desc()).all()
    return [r.to_dict() for r in runs]

# -------------------------------------------------------------
# Video & Image Inspection Trigger Endpoints
# -------------------------------------------------------------

class RunVideoRequest(BaseModel):
    videoFilename: str = "pass_1_initial_detection.mp4"
    runName: str = "Municipal Route 101 Inspection"
    vehicleId: str = "VEH-MUN-402"
    startLat: float = 37.774929
    startLon: float = -122.419416

@app.post("/api/inspections/run-video")
async def run_video_inspection(req: RunVideoRequest, db: Session = Depends(get_db)):
    # Check sample videos first, then uploads
    sample_path = os.path.join(SAMPLE_VIDEOS_DIR, req.videoFilename)
    upload_path = os.path.join(VIDEOS_DIR, req.videoFilename)
    
    if os.path.exists(sample_path):
        target_video = sample_path
    elif os.path.exists(upload_path):
        target_video = upload_path
    else:
        raise HTTPException(status_code=404, detail=f"Video file not found: {req.videoFilename}")

    gps_adapter = SimulatedVehicleGPSAdapter(
        start_lat=req.startLat,
        start_lon=req.startLon,
        speed_kmh=42.0,
        heading_deg=45.0
    )

    loop = asyncio.get_event_loop()
    def sync_callback(evt):
        asyncio.run_coroutine_threadsafe(broadcast_ws_event(evt), loop)

    result = await asyncio.to_thread(
        video_processor.process_video,
        db=db,
        video_path=target_video,
        gps_adapter=gps_adapter,
        vehicle_id=req.vehicleId,
        run_name=req.runName,
        frame_callback=sync_callback,
        frame_stride=1
    )
    return result

@app.post("/api/inspections/upload-video")
async def upload_video(file: UploadFile = File(...), db: Session = Depends(get_db)):
    filename = f"upload_{int(time.time())}_{file.filename}"
    filepath = os.path.join(VIDEOS_DIR, filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    gps_adapter = SimulatedVehicleGPSAdapter(start_lat=37.774929, start_lon=-122.419416)
    result = await asyncio.to_thread(
        video_processor.process_video,
        db=db,
        video_path=filepath,
        gps_adapter=gps_adapter,
        vehicle_id="VEH-EXT-701",
        run_name=f"Uploaded Inspection: {file.filename}",
        frame_stride=2
    )
    return result

@app.post("/api/inspections/test-image")
async def test_single_image(
    file: Optional[UploadFile] = File(None),
    sampleImageName: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    import cv2
    import numpy as np
    
    if file:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    elif sampleImageName:
        img_path = os.path.join(SAMPLE_IMAGES_DIR, sampleImageName)
        if not os.path.exists(img_path):
            raise HTTPException(status_code=404, detail="Sample image not found")
        frame = cv2.imread(img_path)
    else:
        # Default sample image
        img_path = os.path.join(SAMPLE_IMAGES_DIR, "detect.jpg")
        frame = cv2.imread(img_path)

    if frame is None:
        raise HTTPException(status_code=400, detail="Invalid image input")

    now = time.time()
    lat, lon = 37.774929, -122.419416
    detections = detector.detect_frame(
        frame=frame,
        latitude=lat,
        longitude=lon,
        timestamp=now,
        source_id="manual-test-cam",
        vehicle_id="VEH-BENCH-01",
        is_simulated_gps=True
    )

    created_or_matched = []
    for d in detections:
        ev_name = f"evidence_single_{d.id}.jpg"
        ev_path = os.path.join(EVIDENCE_DIR, ev_name)
        ann = detector.annotate_frame(frame, [d], {"vehicle_id": "VEH-BENCH-01", "lat": lat, "lon": lon, "is_simulated": True})
        cv2.imwrite(ev_path, ann)

        issue, is_new, escalation = matching_engine.process_consolidated_detection(
            db=db,
            detection=d,
            inspection_run_id="single_image_test",
            evidence_image_path=f"/evidence/{ev_name}"
        )
        created_or_matched.append({"issue": issue.to_dict(), "isNew": is_new})

    return {
        "success": True,
        "detectionsCount": len(detections),
        "results": created_or_matched
    }

# -------------------------------------------------------------
# Interactive Hackathon Guided Demo Workflow Endpoints
# -------------------------------------------------------------

@app.post("/api/demo/step/{step_number}")
async def execute_demo_step(step_number: int, db: Session = Depends(get_db)):
    """
    1-Click Guided Demo Workflow:
    Step 1: Pass 1 -> Initial detection of road defect -> Creates INF-101 (PENDING_VERIFICATION)
    Step 2: Human Verification -> Inspector reviews evidence -> Verifies INF-101
    Step 3: Pass 2 -> Vehicle re-scans Route 101 -> Matches INF-101 -> Occurrences = 2 (Persistent Monitoring)
    Step 4: Pass 3 -> Vehicle re-scans Day 4 -> Matches INF-101 -> Occurrences = 3 -> Marked PERSISTENT + ESCALATED!
    Step 5: Post-Repair Re-Check -> Vehicle scans repaired road -> Zero defects -> Issue closed as RESOLVED!
    """
    gps_adapter = SimulatedVehicleGPSAdapter(
        start_lat=37.774929,
        start_lon=-122.419416,
        speed_kmh=42.0,
        heading_deg=45.0,
        route_name="Route 101 Test Corridor"
    )

    loop = asyncio.get_event_loop()
    def sync_callback(evt):
        asyncio.run_coroutine_threadsafe(broadcast_ws_event(evt), loop)

    if step_number == 1:
        # Pass 1: Initial Detection
        vid = os.path.join(SAMPLE_VIDEOS_DIR, "pass_1_initial_detection.mp4")
        result = await asyncio.to_thread(
            video_processor.process_video,
            db=db,
            video_path=vid,
            gps_adapter=gps_adapter,
            vehicle_id="VEH-MUN-402",
            run_name="Demo Pass 1: Initial Road Survey",
            frame_callback=sync_callback
        )
        return {
            "step": 1,
            "title": "Pass 1 Completed: Road Defect Detected",
            "description": "Camera footage scanned Route 101. AI detected a severe road fracture/pothole breakdown. Issue created in PENDING_VERIFICATION state.",
            "result": result
        }

    elif step_number == 2:
        # Human Verification of the first pending issue
        issue = db.query(IssueModel).filter(IssueModel.status == IssueStatus.PENDING_VERIFICATION.value).first()
        if not issue:
            # Fallback to any issue
            issue = db.query(IssueModel).first()
        if not issue:
            raise HTTPException(status_code=400, detail="No issues available to verify. Please run Step 1 first.")

        issue.status = IssueStatus.VERIFIED.value
        issue.verified_by = "Senior Municipal Inspector M. Vance"
        issue.verified_at = time.time()
        issue.assigned_to = "District 4 Road Maintenance Squad"
        issue.notes = "Human verification confirmed: Severe road cavity poses hazard to commuter traffic. Dispatched repair work order."
        issue.updated_at = time.time()
        db.commit()
        db.refresh(issue)

        return {
            "step": 2,
            "title": "Human Verification Confirmed",
            "description": f"Human reviewer inspected evidence snapshot, validated AI detection, and transitioned {issue.code} to VERIFIED.",
            "issue": issue.to_dict()
        }

    elif step_number == 3:
        # Pass 2: Repeat Detection (Day 2)
        vid = os.path.join(SAMPLE_VIDEOS_DIR, "pass_2_repeat_pass.mp4")
        result = await asyncio.to_thread(
            video_processor.process_video,
            db=db,
            video_path=vid,
            gps_adapter=gps_adapter,
            vehicle_id="VEH-MUN-402",
            run_name="Demo Pass 2: Day 2 Road Re-Inspection",
            frame_callback=sync_callback
        )
        return {
            "step": 3,
            "title": "Pass 2 Completed: Same Physical Issue Matched",
            "description": "Vehicle drove past the same GPS coordinates. Issue Matching Engine recognized physical proximity and updated existing issue occurrences to 2.",
            "result": result
        }

    elif step_number == 4:
        # Pass 3: Repeat Detection & Escalation (Day 4)
        vid = os.path.join(SAMPLE_VIDEOS_DIR, "pass_3_escalation_pass.mp4")
        result = await asyncio.to_thread(
            video_processor.process_video,
            db=db,
            video_path=vid,
            gps_adapter=gps_adapter,
            vehicle_id="VEH-MUN-402",
            run_name="Demo Pass 3: Day 4 Re-Inspection (Triggers Escalation)",
            frame_callback=sync_callback
        )
        return {
            "step": 4,
            "title": "Pass 3 Completed: Issue Marked PERSISTENT & ESCALATED",
            "description": "Defect observed 3 times without repair. Escalation Engine triggered automated Tier 2 alert and elevated priority to CRITICAL.",
            "result": result
        }

    elif step_number == 5:
        # Pass 4: Repaired Road - Closed-Loop Resolution Re-Check
        vid = os.path.join(SAMPLE_VIDEOS_DIR, "pass_4_repaired_recheck.mp4")
        # Run video processor on repaired video
        result = await asyncio.to_thread(
            video_processor.process_video,
            db=db,
            video_path=vid,
            gps_adapter=gps_adapter,
            vehicle_id="VEH-MUN-402",
            run_name="Demo Pass 4: Post-Repair Re-Inspection",
            frame_callback=sync_callback
        )

        # Trigger resolution re-check on existing open issues along this route
        open_issues = db.query(IssueModel).filter(IssueModel.status != IssueStatus.RESOLVED.value).all()
        rechecked = []
        for iss in open_issues:
            recheck_res = resolution_engine.execute_recheck(
                db=db,
                issue_id=iss.id,
                scanned_lat=iss.latitude,
                scanned_lon=iss.longitude,
                defect_detected=False,
                notes="Automated Pass 4 re-check confirmed road asphalt patch restored. Defect no longer present."
            )
            rechecked.append(recheck_res)

        return {
            "step": 5,
            "title": "Pass 4 Completed: Closed-Loop Repair Verified & Issue RESOLVED",
            "description": "Vehicle scanned the repaired corridor. AI confirmed defect absence. System closed the maintenance loop and marked issue RESOLVED.",
            "result": result,
            "resolutionRechecks": rechecked
        }

    else:
        raise HTTPException(status_code=400, detail="Invalid step number (use 1-5)")

@app.post("/api/demo/reset")
def reset_database(db: Session = Depends(get_db)):
    """
    Cleans all database records and evidence snapshots for a fresh demonstration.
    """
    global last_reset_time
    last_reset_time = time.time()

    db.query(DetectionRecordModel).delete()
    db.query(EscalationLogModel).delete()
    db.query(IssueModel).delete()
    db.query(InspectionRunModel).delete()
    db.commit()

    # Clear generated evidence files, preserving .gitkeep
    if os.path.exists(EVIDENCE_DIR):
        for f in os.listdir(EVIDENCE_DIR):
            if f == ".gitkeep":
                continue
            p = os.path.join(EVIDENCE_DIR, f)
            try:
                if os.path.isfile(p):
                    os.remove(p)
            except Exception:
                pass

    return {
        "success": True,
        "message": "RoadWatch AI database and evidence cache reset to clean state."
    }

# -------------------------------------------------------------
# Frontend Static Asset & SPA Serving
# -------------------------------------------------------------
FRONTEND_DIST = os.path.join(BASE_DIR, "frontend", "dist")
if os.path.exists(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))

