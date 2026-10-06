# Open Source Credits & Attribution

This platform, **RoadWatch AI** (AI-Powered Public Infrastructure Monitoring & Escalation Platform), synthesizes and adapts computer vision, road defect detection, and geospatial processing concepts from the following open-source projects:

---

## 1. Pothole Detection and Reporting System
- **Repository URL:** [https://github.com/napsnu/Pothole-Detection-and-Reporting-System](https://github.com/napsnu/Pothole-Detection-and-Reporting-System)
- **Author:** Anshu Patel (`@napsnu`)
- **License / Terms:** Open public repository under standard GitHub Terms of Service (requesting community contributions for bounding box visualizations).
- **What was Reused / Adapted:**
  - Vehicle-mounted road inspection operational concept: mounting cameras on moving vehicles to capture road damage continuously.
  - Video frame extraction workflow (`frameextractor.py` concepts adapted into our asynchronous video processing engine).
  - OpenStreetMap (OSM) geospatial visualization paradigm for municipal maintenance issues.
  - Sample verification imagery (`detect.jpg`, `car_camera.jpg`) used for integration verification.
- **What was NOT Reused:**
  - The Flutter mobile client application (`flutter_application_1`) was omitted in favor of a modern, responsive web dashboard suitable for municipal control rooms.
  - Direct Firebase client database bindings were omitted in favor of an enterprise relational SQL database (SQLite/PostgreSQL) with full transaction support.
  - Pothole-only single-class isolation was replaced with a normalized multi-defect infrastructure taxonomy.

---

## 2. PaveScan-AI
- **Repository URL:** [https://github.com/ube09/PaveScan-AI](https://github.com/ube09/PaveScan-AI)
- **Author:** Usama Bin Ejaz (`@ube09`), Founder, UBE Labs
- **License / Terms:** Open public repository under standard GitHub Terms of Service.
- **What was Reused / Adapted:**
  - Fine-tuned YOLOv8 PyTorch model checkpoint: `Final_RP_best.pt` (trained on road distress and roadside assets including light poles, edge damage, asphalt cracking, ravelling, transverse unevenness, and paver distress).
  - Python-based Ultralytics YOLO inference pipeline.
  - Bounding box area-based damage severity classification formulas (adapting area thresholding from `calculate_depth_of_damage` in `final.py` and `classify_severity` in `updated.py`).
  - GNSS/GPS coordinate projection concepts from `gnss.py` and `updated.py` (deriving defect-specific geospatial coordinates from frame camera GNSS + bounding box center offsets).
- **What was NOT Reused:**
  - Stereolabs ZED stereo `.svo2` proprietary SDK dependencies (`pyzed.sl`), depth map `.npy` file requirements, and stereo calibration UI.
  - Dutch-specific asset naming schemes (raw Dutch class labels were mapped to clean, internationally standardized public infrastructure defect types).
  - Standalone CSV/Excel batch export scripts were replaced with a real-time REST/WebSocket API and interactive dashboard.
  - VRI (roadside marker) distance analytics.

---

## 3. What Was Built By Our Team (Original System Core)

Our team designed and built the **unified continuous monitoring and governance platform**:
1. **Unified Common Detection Format:** A vendor-neutral, normalized schema (`id`, `type`, `confidence`, `bbox`, `evidenceImage`, `latitude`, `longitude`, `timestamp`, `sourceId`, `vehicleId`, `severity`).
2. **Temporal Frame-to-Frame Deduplication:** Computer vision object tracking that consolidates consecutive video frames (preventing 20 frames of 1 pothole from producing 20 distinct issues).
3. **Cross-Run Same-Issue Matching Engine:** Haversine geospatial proximity clustering + defect type correlation that recognizes when subsequent vehicle inspection passes detect the *same physical defect*.
4. **Automated Escalation State Machine:**
   - Pass 1: New Issue Created (`PENDING_VERIFICATION`).
   - Pass 2: Issue Matched (`Occurrences = 2`, Persistent Monitoring).
   - Pass 3: Issue Matched (`Occurrences = 3`, Elevated to `PERSISTENT` + `ESCALATED` notice triggered).
5. **Closed-Loop Resolution Re-Check Engine:** Future inspection vehicle passes over a repaired issue location automatically verify resolution when the defect is no longer observed.
6. **Rule-Based Explainable Priority Engine:** Computes priority scores (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) with transparent mathematical factor breakdown.
7. **Human Verification Workflow:** Dedicated reviewer interface with evidence image inspection, bounding box toggle, and one-click `VERIFY` / `REJECT` actions.
8. **Modern Interactive Dashboard:** Full-stack React + Tailwind/CSS frontend with OpenStreetMap, live video playback with YOLO overlay, KPI statistics, issue timeline, and end-to-end demo runner.
