import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import StatsBar from './components/StatsBar';
import InteractiveMap from './components/InteractiveMap';
import VideoInspector from './components/VideoInspector';
import VerificationQueue from './components/VerificationQueue';
import IssueListTable from './components/IssueListTable';

export default function App() {
  const [activeScreen, setActiveScreen] = useState('dashboard'); // 'dashboard' | 'monitor' | 'issues' | 'map'

  const [stats, setStats] = useState({
    totalDetected: 0,
    pendingVerification: 0,
    verified: 0,
    highOrCritical: 0,
    persistent: 0,
    resolved: 0,
    escalationsCount: 0,
    totalOccurrences: 0
  });

  const [issues, setIssues] = useState([]);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Video Inspection state
  const [liveFrame, setLiveFrame] = useState(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectionProgress, setInspectionProgress] = useState(0);
  const [isResetting, setIsResetting] = useState(false);

  const wsRef = useRef(null);

  // Fetch stats and issues from backend API
  const refreshData = async () => {
    try {
      const [statsRes, issuesRes] = await Promise.all([
        fetch('/api/stats'),
        fetch(`/api/issues?status=${statusFilter}&search=${encodeURIComponent(searchQuery)}`)
      ]);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
      if (issuesRes.ok) {
        const issuesData = await issuesRes.json();
        setIssues(issuesData);
        // Keep selectedIssue in sync if it was updated
        if (selectedIssue) {
          const refreshed = issuesData.find(i => i.id === selectedIssue.id);
          if (refreshed) setSelectedIssue(refreshed);
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 3000);
    return () => clearInterval(interval);
  }, [statusFilter, searchQuery]);

  // Setup WebSocket connection for telemetry
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/inspection`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'FRAME_UPDATE') {
          setLiveFrame(data);
          setInspectionProgress(data.progress || 0);
          setIsInspecting(true);
        } else if (data.type === 'RUN_COMPLETED') {
          setIsInspecting(false);
          setInspectionProgress(100);
          refreshData();
        }
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    ws.onclose = () => console.log('WS disconnected');
    return () => ws.close();
  }, []);

  // Handlers
  const handleRunVideo = async (videoFilename) => {
    setIsInspecting(true);
    setInspectionProgress(0);
    try {
      await fetch('/api/inspections/run-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoFilename })
      });
      setIsInspecting(false);
      refreshData();
    } catch (err) {
      console.error(err);
      setIsInspecting(false);
    }
  };

  const handleUploadVideo = async (file) => {
    setIsInspecting(true);
    setInspectionProgress(0);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await fetch('/api/inspections/upload-video', {
        method: 'POST',
        body: formData
      });
      setIsInspecting(false);
      refreshData();
    } catch (err) {
      console.error(err);
      setIsInspecting(false);
    }
  };

  const handleTestImage = async (file, sampleName) => {
    const formData = new FormData();
    if (file) formData.append('file', file);
    else if (sampleName) formData.append('sampleImageName', sampleName);

    try {
      await fetch('/api/inspections/test-image', {
        method: 'POST',
        body: formData
      });
      refreshData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleVerify = async (issueId) => {
    try {
      const res = await fetch(`/api/issues/${issueId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer: 'DPW District 4 Dispatcher', notes: 'Confirmed defect from optical camera evidence' })
      });
      const updated = await res.json();
      refreshData();
      if (selectedIssue && selectedIssue.id === issueId) {
        setSelectedIssue(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReject = async (issueId) => {
    try {
      const res = await fetch(`/api/issues/${issueId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer: 'DPW District 4 Dispatcher', reason: 'Dismissed as false positive' })
      });
      const updated = await res.json();
      refreshData();
      if (selectedIssue && selectedIssue.id === issueId) {
        setSelectedIssue(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStatus = async (issueId, status, notes) => {
    try {
      const res = await fetch(`/api/issues/${issueId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes })
      });
      const updated = await res.json();
      refreshData();
      if (selectedIssue && selectedIssue.id === issueId) {
        setSelectedIssue(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTriggerRecheck = async (issueId) => {
    try {
      const res = await fetch(`/api/issues/${issueId}/resolution-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defectDetected: false, notes: 'Automated camera re-scan confirmed repair patch clear' })
      });
      await res.json();
      refreshData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await fetch('/api/demo/reset', { method: 'POST' });
      setSelectedIssue(null);
      setLiveFrame(null);
      setIssues([]);
      setStats({
        totalDetected: 0,
        pendingVerification: 0,
        verified: 0,
        highOrCritical: 0,
        persistent: 0,
        resolved: 0,
        escalationsCount: 0,
        totalOccurrences: 0
      });
      // Give DB and network time to settle
      await new Promise(r => setTimeout(r, 400));
      const [statsRes, issuesRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/issues')
      ]);
      if (statsRes.ok) {
        const s = await statsRes.json();
        setStats(s);
      }
      if (issuesRes.ok) {
        const iss = await issuesRes.json();
        setIssues(iss);
      }
    } catch (err) {
      console.error('Reset error:', err);
    } finally {
      setIsResetting(false);
    }
  };

  const pendingIssues = issues.filter(i => i.status === 'PENDING_VERIFICATION');
  const verifiedIssues = issues.filter(i => i.status === 'VERIFIED');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-main)' }}>
      {/* Top Header & Navigation Bar */}
      <Header
        activeScreen={activeScreen}
        onSelectScreen={setActiveScreen}
        onReset={handleReset}
        isResetting={isResetting}
        stats={stats}
      />

      {/* Main Workspace View */}
      <main style={{ padding: '16px 24px', flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1920px', margin: '0 auto', width: '100%' }}>
        {/* ==================== SCREEN 1: DASHBOARD ==================== */}
        {activeScreen === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 5 KPI Metric Cards */}
            <StatsBar
              stats={stats}
              issues={issues}
              selectedFilter={statusFilter}
              onSelectFilter={(f) => setStatusFilter(f)}
            />

            {/* Main Operational Split: Live Camera (65%) & Human Verification Station (35%) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1.25fr 0.75fr',
              gap: '16px',
              minHeight: '460px'
            }}>
              <VideoInspector
                liveFrame={liveFrame}
                isInspecting={isInspecting}
                onRunVideo={handleRunVideo}
                onUploadVideo={handleUploadVideo}
                onTestImage={handleTestImage}
                inspectionProgress={inspectionProgress}
                onRefreshData={refreshData}
              />

              <VerificationQueue
                selectedIssue={selectedIssue}
                issues={issues}
                pendingIssues={pendingIssues}
                verifiedIssues={verifiedIssues}
                onVerify={handleVerify}
                onReject={handleReject}
                onUpdateStatus={handleUpdateStatus}
                onTriggerRecheck={handleTriggerRecheck}
                onSelectIssue={(iss) => setSelectedIssue(iss)}
              />
            </div>

            {/* Bottom Row: Geospatial Corridor Map Preview + Defect Inventory Table */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1.1fr 0.9fr',
              gap: '16px',
              minHeight: '420px'
            }}>
              <div className="civic-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div className="civic-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-amber)' }}>map</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      GEOSPATIAL ROAD CORRIDOR MAP PREVIEW
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    District 4 Arterials · Sector B
                  </span>
                </div>
                <div style={{ flex: 1, minHeight: '340px' }}>
                  <InteractiveMap
                    issues={issues}
                    selectedIssue={selectedIssue}
                    onSelectIssue={(iss) => setSelectedIssue(iss)}
                  />
                </div>
              </div>

              <IssueListTable
                issues={issues}
                selectedIssue={selectedIssue}
                onSelectIssue={(iss) => setSelectedIssue(iss)}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
              />
            </div>
          </div>
        )}

        {/* ==================== SCREEN 2: MONITOR ==================== */}
        {activeScreen === 'monitor' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  FULL-SCREEN COMPUTER VISION MONITOR
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Real-time neural network inference running at sub-130ms on CPU with ONNX Runtime
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className="civic-btn civic-btn-outline"
                  onClick={() => refreshData()}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>refresh</span>
                  <span>Sync Telemetry</span>
                </button>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1.25fr 0.75fr',
              gap: '16px',
              minHeight: '620px'
            }}>
              <VideoInspector
                liveFrame={liveFrame}
                isInspecting={isInspecting}
                onRunVideo={handleRunVideo}
                onUploadVideo={handleUploadVideo}
                onTestImage={handleTestImage}
                inspectionProgress={inspectionProgress}
                onRefreshData={refreshData}
              />

              <VerificationQueue
                selectedIssue={selectedIssue}
                issues={issues}
                pendingIssues={pendingIssues}
                verifiedIssues={verifiedIssues}
                onVerify={handleVerify}
                onReject={handleReject}
                onUpdateStatus={handleUpdateStatus}
                onTriggerRecheck={handleTriggerRecheck}
                onSelectIssue={(iss) => setSelectedIssue(iss)}
              />
            </div>
          </div>
        )}

        {/* ==================== SCREEN 3: ISSUE DETAILS ==================== */}
        {activeScreen === 'issues' && (
          <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: '16px' }}>
            {/* Left: Active Selected Issue Dossier */}
            <div className="civic-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', pb: '12px', paddingBottom: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  DETAILED INCIDENT DOSSIER
                </span>
                {selectedIssue && (
                  <span className="civic-badge badge-warning">
                    PASS #{selectedIssue.occurrences || 1}
                  </span>
                )}
              </div>

              {selectedIssue ? (
                <>
                  {/* Evidence Image with ROI */}
                  <div style={{
                    position: 'relative',
                    width: '100%',
                    height: '240px',
                    backgroundColor: '#0b1c30',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid var(--border-subtle)'
                  }}>
                    {selectedIssue.evidenceImagePath ? (
                      <img
                        src={selectedIssue.evidenceImagePath}
                        alt="Evidence"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ color: '#94a3b8' }}>No evidence image snapshot</div>
                    )}
                    <div style={{
                      position: 'absolute',
                      inset: '16px',
                      border: '2px dashed rgba(220, 38, 38, 0.8)',
                      pointerEvents: 'none',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'flex-end',
                      padding: '6px'
                    }}>
                      <span style={{
                        backgroundColor: 'var(--status-critical)',
                        color: '#ffffff',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        padding: '2px 6px',
                        fontWeight: 700
                      }}>
                        ROI CROP #{selectedIssue.code}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {selectedIssue.title}
                    </h3>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      {selectedIssue.locationName} · GPS: {selectedIssue.latitude?.toFixed(5)}, {selectedIssue.longitude?.toFixed(5)}
                    </div>
                  </div>

                  {/* Grid details */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                    backgroundColor: '#fafbfc',
                    padding: '12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '12px'
                  }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block' }}>Defect Type:</span>
                      <span style={{ fontWeight: 600 }}>{selectedIssue.defectType}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block' }}>Confidence:</span>
                      <span style={{ fontWeight: 700, color: '#15803d' }}>{(selectedIssue.confidence * 100).toFixed(1)}%</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block' }}>Severity:</span>
                      <span style={{ fontWeight: 600, color: 'var(--status-critical)' }}>{selectedIssue.priority}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block' }}>Status:</span>
                      <span style={{ fontWeight: 600 }}>{selectedIssue.status}</span>
                    </div>
                  </div>

                  {/* Dispatch buttons */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="civic-btn civic-btn-accent"
                      style={{ flex: 1 }}
                      onClick={() => handleVerify(selectedIssue.id)}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>assignment_turned_in</span>
                      <span>Verify &amp; Dispatch</span>
                    </button>
                    <button
                      className="civic-btn civic-btn-outline"
                      style={{ flex: 0.8 }}
                      onClick={() => handleReject(selectedIssue.id)}
                    >
                      Dismiss (False Positive)
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  Select an incident from the inventory table on the right to inspect its dossier.
                </div>
              )}
            </div>

            {/* Right: Full Defect Inventory Table */}
            <IssueListTable
              issues={issues}
              selectedIssue={selectedIssue}
              onSelectIssue={(iss) => setSelectedIssue(iss)}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
            />
          </div>
        )}

        {/* ==================== SCREEN 4: MAP ==================== */}
        {activeScreen === 'map' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  GEOSPATIAL ROAD CORRIDOR INFRASTRUCTURE MAP
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Cartographic GIS visualization with automated road defect coordinates and Unit 402 fleet telemetry
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <span className="civic-badge badge-neutral">Total Plotted: {issues.length}</span>
                <span className="civic-badge badge-critical">Critical: {issues.filter(i => i.priority === 'CRITICAL').length}</span>
              </div>
            </div>

            <div className="civic-card" style={{ flex: 1, minHeight: '620px', overflow: 'hidden' }}>
              <InteractiveMap
                issues={issues}
                selectedIssue={selectedIssue}
                onSelectIssue={(iss) => {
                  setSelectedIssue(iss);
                }}
              />
            </div>
          </div>
        )}
      </main>


      {/* Civic Operations Footer */}
      <footer style={{
        backgroundColor: '#ffffff',
        borderTop: '1px solid var(--border-subtle)',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '11px',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16a34a' }}></span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>CV Cluster: US-WEST-4A</span>
          </span>
          <span>|</span>
          <span>Inference: YOLOv8 ONNX Runtime (CPU)</span>
          <span>|</span>
          <span>Storage Pool: 84.2 TB Available</span>
        </div>
        <div>
          <span>Department of Public Works &amp; Infrastructure · District 4 Control Center</span>
        </div>
      </footer>
    </div>
  );
}
