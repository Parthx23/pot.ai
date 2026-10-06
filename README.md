# pot.ai

> **AI-Powered Public Infrastructure Monitoring & Road Defect Intelligence Platform**

pot.ai is an intelligent computer-vision and civic telemetry system designed for municipalities, public works departments, and smart cities. It automatically monitors road networks, detects pavement defects, and manages work orders in real time.

---

## 🚀 Key Capabilities

- **Real-Time Camera Detection**: Instant inference via webcam or vehicular dashcam feed detecting potholes, damaged asphalt, and broken streetlights.
- **Dedicated YOLOv8 ONNX Models**: Sub-50ms inference utilizing optimized ONNX Runtime with dedicated pothole detection and multi-class road defect classification.
- **Batch Video Inspection**: Upload road patrol footage with frame-by-frame defect localization, timestamp tracking, and bounding-box overlay generation.
- **Municipal GIS Corridor Map**: Integrated **CARTO Basemaps** (Voyager, Positron, Dark Matter) with geospatial defect pinning, clustering, and defect severity color-coding.
- **Verification & Review Station**: Inline side-by-side human review console for engineering verification, auto-crop evidence viewing, and work order escalation.
- **Civic Analytics & Reporting**: Real-time stats on pending verifications, critical defect distribution, multi-pass recurrence tracking, and exportable logs.

---

## 🛠 Tech Stack

- **AI & Computer Vision**: YOLOv8, ONNX Runtime, OpenCV, PyTorch, Ultralytics
- **Backend API**: FastAPI, Uvicorn, SQLite, Python 3.13
- **Frontend App**: React 19, Vite, Leaflet, CARTO Basemaps API, Lucide Icons
- **Design System**: Civic Engineering theme, responsive multi-screen layout (Dashboard, Live Monitor, Issue Desk, GIS Map)

---

## 🏁 Quickstart Guide

### 1. Prerequisites
- Python 3.10+
- Node.js 18+ & npm

### 2. Backend Setup
```bash
# Install Python dependencies
pip install fastapi uvicorn onnxruntime opencv-python numpy ultralytics

# Start FastAPI server (Port 8001)
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8001
```

### 3. Frontend Setup
```bash
# Navigate to frontend and install dependencies
cd frontend
npm install

# Start Vite development server (Port 5173)
npm run dev -- --host 0.0.0.0 --port 5173
```

Open **http://localhost:5173** to launch the pot.ai civic operations dashboard.

---

## 🗺 CARTO Basemap Integration
To customize the CARTO Basemap API key:
Create or edit `frontend/.env`:
```env
VITE_CARTO_API_KEY=your_carto_basemap_api_key_here
```

---

## 📄 License
MIT License.
