import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Video, Upload, CameraOff, AlertTriangle, Play, Radio, CheckCircle2 } from 'lucide-react';

export default function VideoInspector({
  liveFrame,
  isInspecting,
  onRunVideo,
  onUploadVideo,
  onTestImage,
  inspectionProgress,
  onRefreshData
}) {
  // Input Modes: 'camera' (Live Camera) or 'video' (Upload Video)
  const [sourceMode, setSourceMode] = useState('camera'); 
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [isStreamingAi, setIsStreamingAi] = useState(true);
  const [realGps, setRealGps] = useState({ lat: 37.774929, lon: -122.419416, isReal: false });
  const [cameraDetections, setCameraDetections] = useState([]);
  const [uploadedVideoName, setUploadedVideoName] = useState('');

  // Detection Filters
  const [filterPotholes, setFilterPotholes] = useState(true);
  const [filterCracks, setFilterCracks] = useState(true);
  const [filterStreetlights, setFilterStreetlights] = useState(true);

  // Confidence / Sensitivity slider (default 20%)
  const [confThreshold, setConfThreshold] = useState(20);
  const isSendingRef = useRef(false);
  const frameDimRef = useRef({ w: 640, h: 360 });

  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const wsCameraRef = useRef(null);
  const processIntervalRef = useRef(null);
  const fileInputRef = useRef(null);

  // 1. Device enumeration and Geolocation
  useEffect(() => {
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const videoDevs = devices.filter(d => d.kind === 'videoinput');
        setAvailableDevices(videoDevs);
        if (videoDevs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoDevs[0].deviceId);
        }
      }).catch(err => console.log('Enumerate devices error:', err));
    }

    if (navigator.geolocation) {
      const geoWatch = navigator.geolocation.watchPosition(
        (pos) => {
          setRealGps({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            isReal: true
          });
        },
        (err) => console.log('GPS watch fallback:', err.message),
        { enableHighAccuracy: true, timeout: 5000 }
      );
      return () => navigator.geolocation.clearWatch(geoWatch);
    }
  }, []);

  // 2. Start Camera
  const startCamera = async (deviceId = selectedDeviceId) => {
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const constraints = {
        video: deviceId 
          ? { deviceId: { exact: deviceId } } 
          : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
      connectCameraWebSocket();
    } catch (err) {
      console.error('Camera access error:', err);
      setCameraError(`Camera permission needed: ${err.message}. Please allow camera access.`);
      setIsCameraActive(false);
    }
  };

  // 3. Stop Camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (wsCameraRef.current) {
      wsCameraRef.current.close();
      wsCameraRef.current = null;
    }
    if (processIntervalRef.current) {
      clearInterval(processIntervalRef.current);
      processIntervalRef.current = null;
    }
    setIsCameraActive(false);
    setCameraDetections([]);
  };

  // 4. WebSocket setup
  const connectCameraWebSocket = useCallback(() => {
    if (wsCameraRef.current && wsCameraRef.current.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/camera-stream`;
    const ws = new WebSocket(wsUrl);
    wsCameraRef.current = ws;

    ws.onmessage = (event) => {
      isSendingRef.current = false;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'CAMERA_DETECTIONS') {
          setCameraDetections(data.detections || []);
          if (data.newIssue || data.escalation) {
            if (onRefreshData) onRefreshData();
          }
        }
      } catch (e) {
        console.error('Camera WS parse error:', e);
      }
    };

    ws.onerror = (e) => {
      isSendingRef.current = false;
      console.log('Camera WS error, will fallback to REST frame inference:', e);
    };
  }, [onRefreshData]);

  // 5. Continuous frame capture and dispatch (every 200ms with inflight guard)
  useEffect(() => {
    if (!isCameraActive || !isStreamingAi) {
      if (processIntervalRef.current) clearInterval(processIntervalRef.current);
      return;
    }

    const captureAndSend = () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      if (isSendingRef.current) return;

      const video = videoRef.current;
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 360;

      const scale = Math.min(1.0, 640 / Math.max(vw, vh));
      const targetW = Math.round(vw * scale);
      const targetH = Math.round(vh * scale);
      frameDimRef.current = { w: targetW, h: targetH };

      const offscreen = document.createElement('canvas');
      offscreen.width = targetW;
      offscreen.height = targetH;
      const ctx = offscreen.getContext('2d');
      ctx.drawImage(video, 0, 0, targetW, targetH);

      const b64 = offscreen.toDataURL('image/jpeg', 0.70);
      isSendingRef.current = true;

      const payload = {
        image: b64,
        lat: realGps.lat,
        lon: realGps.lon,
        isSimulated: !realGps.isReal,
        vehicleId: 'VEH-MUN-402',
        autoCapture: true,
        conf: confThreshold / 100.0
      };

      if (wsCameraRef.current && wsCameraRef.current.readyState === WebSocket.OPEN) {
        wsCameraRef.current.send(JSON.stringify(payload));
      } else {
        fetch('/api/camera/process-frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then(res => res.json())
          .then(data => {
            isSendingRef.current = false;
            if (data.detections) {
              setCameraDetections(data.detections);
            }
            if (data.newIssues?.length > 0 || data.matchedIssues?.length > 0) {
              if (onRefreshData) onRefreshData();
            }
          })
          .catch(e => {
            isSendingRef.current = false;
            console.log('REST frame error:', e);
          });
      }
    };

    processIntervalRef.current = setInterval(captureAndSend, 200);

    return () => {
      if (processIntervalRef.current) clearInterval(processIntervalRef.current);
    };
  }, [isCameraActive, isStreamingAi, realGps, confThreshold, onRefreshData]);

  // 6. Draw Bounding Boxes and Reticles on Canvas
  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) return;
    const canvas = canvasRef.current;
    const { w: fw, h: fh } = frameDimRef.current;
    if (canvas.width !== fw || canvas.height !== fh) {
      canvas.width = fw;
      canvas.height = fh;
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!isCameraActive || cameraDetections.length === 0) return;

    cameraDetections.forEach((det) => {
      // Filter checks
      const typeLower = (det.type || '').toLowerCase();
      if (!filterPotholes && typeLower.includes('pothole')) return;
      if (!filterCracks && (typeLower.includes('road_') || typeLower.includes('surface') || typeLower.includes('crack'))) return;
      if (!filterStreetlights && typeLower.includes('light')) return;

      const x1 = det.bbox.x1;
      const y1 = det.bbox.y1;
      const x2 = det.bbox.x2;
      const y2 = det.bbox.y2;
      const w = Math.max(10, x2 - x1);
      const h = Math.max(10, y2 - y1);

      // Color coding: Critical (Red #dc2626), Moderate/Crack (Amber #d97706), Light Pole (Orange #ea580c)
      let primaryColor = '#d97706';
      if (det.severity === 'CRITICAL' || typeLower.includes('pothole')) {
        primaryColor = '#dc2626';
      } else if (det.severity === 'HIGH' || typeLower.includes('light')) {
        primaryColor = '#ea580c';
      }

      // Box line
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, y1, w, h);

      // Corner reticles
      const corner = Math.min(14, Math.min(w, h) * 0.3);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1 + corner); ctx.lineTo(x1, y1); ctx.lineTo(x1 + corner, y1);
      ctx.moveTo(x2 - corner, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + corner);
      ctx.moveTo(x1, y2 - corner); ctx.lineTo(x1, y2); ctx.lineTo(x1 + corner, y2);
      ctx.moveTo(x2 - corner, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - corner);
      ctx.stroke();

      // Centroid marker dot
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      ctx.fillStyle = primaryColor;
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();

      // Top label badge
      const labelText = `${det.displayName?.toUpperCase() || 'POTHOLE'} · ${(det.confidence * 100).toFixed(0)}% CONF · ${det.severity}`;
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      const textMetrics = ctx.measureText(labelText);
      const badgeW = textMetrics.width + 12;
      const badgeH = 18;
      const badgeY = Math.max(2, y1 - badgeH - 2);

      ctx.fillStyle = primaryColor;
      ctx.fillRect(x1, badgeY, badgeW, badgeH);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, x1 + 6, badgeY + 12);
    });
  }, [cameraDetections, isCameraActive, filterPotholes, filterCracks, filterStreetlights]);

  // Start camera on mount if camera mode is active
  useEffect(() => {
    if (sourceMode === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [sourceMode]);

  // Video File Upload handler
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedVideoName(file.name);
      setSourceMode('video');
      onUploadVideo(file);
    }
  };

  return (
    <div className="civic-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Viewport Top Mode Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        backgroundColor: '#fafbfc',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        {/* Two explicit input modes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            id="btn-mode-camera"
            onClick={() => setSourceMode('camera')}
            style={{
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: 'var(--radius-xs)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: '1px solid',
              backgroundColor: sourceMode === 'camera' ? '#ffffff' : 'transparent',
              borderColor: sourceMode === 'camera' ? 'var(--border-medium)' : 'transparent',
              color: sourceMode === 'camera' ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: sourceMode === 'camera' ? 'var(--shadow-xs)' : 'none'
            }}
          >
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isCameraActive ? 'var(--status-critical)' : '#94a3b8',
              animation: isCameraActive ? 'radar-pulse 1.5s infinite' : 'none'
            }}></span>
            <span>Live Camera (Dashcam Unit 402)</span>
          </button>

          <button
            id="btn-mode-video"
            onClick={() => {
              setSourceMode('video');
              fileInputRef.current?.click();
            }}
            style={{
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: 'var(--radius-xs)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: '1px solid',
              backgroundColor: sourceMode === 'video' ? '#ffffff' : 'transparent',
              borderColor: sourceMode === 'video' ? 'var(--border-medium)' : 'transparent',
              color: sourceMode === 'video' ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: sourceMode === 'video' ? 'var(--shadow-xs)' : 'none'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>file_upload</span>
            <span>Upload Inspection Video</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        {/* Telemetry Stream Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>videocam</span>
            Optical Feed HD-1
          </span>
          <span style={{ color: 'var(--border-subtle)' }}>|</span>
          <span>30.00 FPS / H.264</span>
          <span style={{ color: 'var(--border-subtle)' }}>|</span>
          <span style={{ color: isCameraActive ? '#15803d' : '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isCameraActive ? '#16a34a' : '#94a3b8' }}></span>
            {isCameraActive ? 'LIVE ACTIVE' : 'STANDBY'}
          </span>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: '440px',
        backgroundColor: '#0b1c30',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {/* MODE A: LIVE CAMERA FEED */}
        {sourceMode === 'camera' && (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: isCameraActive ? 'block' : 'none'
              }}
            />
            {/* Real-Time Bounding Box Canvas Overlay */}
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                pointerEvents: 'none',
                display: isCameraActive ? 'block' : 'none'
              }}
            />

            {!isCameraActive && (
              <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                {cameraError ? (
                  <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '14px' }}>
                    <AlertTriangle size={36} style={{ margin: '0 auto 8px', color: '#f87171' }} />
                    <div>{cameraError}</div>
                  </div>
                ) : (
                  <div>
                    <CameraOff size={36} color="#64748b" style={{ margin: '0 auto 10px' }} />
                    <div style={{ fontSize: '13px', color: '#cbd5e1' }}>Camera ready for real-time road inspection.</div>
                  </div>
                )}
                <button
                  id="btn-activate-camera"
                  className="civic-btn civic-btn-accent"
                  onClick={() => startCamera()}
                  style={{ marginTop: '12px' }}
                >
                  <Camera size={14} /> Start Live Camera Feed
                </button>
              </div>
            )}
          </>
        )}

        {/* MODE B: UPLOADED VIDEO INSPECTION */}
        {sourceMode === 'video' && (
          <>
            {liveFrame?.frameImage ? (
              <img
                src={liveFrame.frameImage}
                alt="Inspection frame"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                <Video size={38} color="#64748b" style={{ margin: '0 auto 10px' }} />
                <div style={{ fontSize: '13px', color: '#e2e8f0', marginBottom: '4px' }}>
                  {uploadedVideoName ? `Uploaded Video: ${uploadedVideoName}` : 'Upload road footage to run YOLOv8 detection'}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '14px' }}>
                  Supports MP4, MOV, AVI formats up to 100MB
                </div>
                <button
                  className="civic-btn civic-btn-accent"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={14} /> Choose Road Video File
                </button>
              </div>
            )}

            {/* Video Processing Progress Bar */}
            {isInspecting && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '4px',
                backgroundColor: 'rgba(255,255,255,0.2)'
              }}>
                <div style={{
                  height: '100%',
                  width: `${inspectionProgress}%`,
                  backgroundColor: 'var(--accent-amber)',
                  transition: 'width 0.1s linear'
                }} />
              </div>
            )}
          </>
        )}

        {/* Active Detections Banner (Top Right of Viewport) */}
        {isCameraActive && (
          <div style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            backgroundColor: cameraDetections.length > 0 ? 'rgba(220, 38, 38, 0.95)' : 'rgba(22, 163, 74, 0.9)',
            color: '#ffffff',
            padding: '4px 10px',
            borderRadius: 'var(--radius-xs)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <Radio size={12} className="radar-sweep" />
            <span>
              {cameraDetections.length > 0 
                ? `${cameraDetections.length} HAZARD${cameraDetections.length > 1 ? 'S' : ''} DETECTED` 
                : 'SCANNING CORRIDOR FOR DEFECTS'}
            </span>
          </div>
        )}

        {/* Bottom Telemetry HUD Overlay Strip */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'rgba(11, 28, 48, 0.94)',
          borderTop: '1px solid rgba(255, 255, 255, 0.12)',
          padding: '6px 16px',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          flexWrap: 'wrap',
          gap: '6px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#fed7aa' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '13px', color: 'var(--accent-amber)' }}>location_on</span>
              GPS: {realGps.lat.toFixed(4)}° N, {Math.abs(realGps.lon).toFixed(4)}° W
            </span>
            <span style={{ color: '#475569' }}>|</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#e2e8f0' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>speed</span>
              SPD: 42 km/h
            </span>
            <span style={{ color: '#475569' }}>|</span>
            <span style={{ color: '#fed7aa', fontWeight: 600 }}>Route 101 KM 54.2 Northbound</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: '#86efac' }}>LATENCY: ~125ms (ONNX)</span>
            <span style={{ color: '#475569' }}>|</span>
            <span style={{ color: '#cbd5e1' }}>30 FPS / 1080p</span>
          </div>
        </div>
      </div>

      {/* Viewport Controls & Filters Footer Bar */}
      <div style={{
        padding: '10px 16px',
        backgroundColor: '#ffffff',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Sensitivity Slider & Class Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          {/* Sensitivity Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label htmlFor="sensitivity" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Sensitivity:
            </label>
            <input
              id="sensitivity"
              type="range"
              min="10"
              max="50"
              step="2"
              value={confThreshold}
              onChange={(e) => setConfThreshold(Number(e.target.value))}
              style={{ width: '80px', accentColor: 'var(--accent-amber)', cursor: 'pointer' }}
              title={`Confidence threshold: ${confThreshold}%`}
            />
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)', minWidth: '30px' }}>
              {confThreshold}%
            </span>
          </div>

          <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border-subtle)' }}></div>

          {/* Defect Category Toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={filterPotholes}
                onChange={(e) => setFilterPotholes(e.target.checked)}
                style={{ accentColor: 'var(--status-critical)' }}
              />
              Potholes
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={filterCracks}
                onChange={(e) => setFilterCracks(e.target.checked)}
                style={{ accentColor: 'var(--accent-amber)' }}
              />
              Damaged Roads
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={filterStreetlights}
                onChange={(e) => setFilterStreetlights(e.target.checked)}
                style={{ accentColor: '#ea580c' }}
              />
              Streetlights
            </label>
          </div>
        </div>

        {/* Live Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            id="btn-instant-snapshot"
            className="civic-btn civic-btn-outline"
            onClick={() => {
              if (!videoRef.current) return;
              const canvas = document.createElement('canvas');
              canvas.width = 640;
              canvas.height = 360;
              canvas.getContext('2d').drawImage(videoRef.current, 0, 0, 640, 360);
              const b64 = canvas.toDataURL('image/jpeg', 0.85);
              fetch('/api/camera/process-frame', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  image: b64,
                  lat: realGps.lat,
                  lon: realGps.lon,
                  isSimulated: !realGps.isReal,
                  vehicleId: 'VEH-MUN-402',
                  autoCapture: true,
                  conf: confThreshold / 100.0
                })
              }).then(res => res.json()).then(() => onRefreshData && onRefreshData());
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>photo_camera</span>
            <span>Capture Instant Snapshot</span>
          </button>

          <button
            id="btn-emergency-flag"
            className="civic-btn civic-btn-destructive"
            onClick={() => {
              if (cameraDetections.length > 0 && onRefreshData) {
                onRefreshData();
              }
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>flag</span>
            <span>Emergency Flag</span>
          </button>
        </div>
      </div>
    </div>
  );
}
