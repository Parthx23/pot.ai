import React, { useState } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  MapPin, 
  AlertCircle, 
  ShieldCheck, 
  Clock, 
  Send, 
  RefreshCw, 
  Check, 
  X, 
  ChevronRight, 
  Eye, 
  Flame, 
  ShieldAlert,
  Sliders,
  CheckCheck
} from 'lucide-react';

export default function VerificationQueue({
  selectedIssue = null,
  issues = [],
  pendingIssues = [],
  verifiedIssues = [],
  onVerify,
  onReject,
  onUpdateStatus,
  onTriggerRecheck,
  onSelectIssue
}) {
  const [actionFeedback, setActionFeedback] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Active issue under verification: prioritized selected issue, or first pending, or first overall
  const activeIssue = selectedIssue || (pendingIssues.length > 0 ? pendingIssues[0] : (issues.length > 0 ? issues[0] : null));

  const showNotification = (msg) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 3500);
  };

  const handleVerifyClick = async () => {
    if (!activeIssue) return;
    setIsProcessing(true);
    try {
      if (onVerify) await onVerify(activeIssue.id);
      showNotification(`Hazard verified & Work Order dispatched for ${activeIssue.code}`);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectClick = async () => {
    if (!activeIssue) return;
    setIsProcessing(true);
    try {
      if (onReject) await onReject(activeIssue.id);
      showNotification(`Dismissed ${activeIssue.code} as false positive`);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStatusChange = async (status, notes) => {
    if (!activeIssue || !onUpdateStatus) return;
    setIsProcessing(true);
    try {
      await onUpdateStatus(activeIssue.id, status, notes);
      showNotification(`Status updated to ${status.replace('_', ' ')}`);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRecheckClick = async () => {
    if (!activeIssue || !onTriggerRecheck) return;
    setIsProcessing(true);
    try {
      await onTriggerRecheck(activeIssue.id);
      showNotification(`Automated AI re-check completed for ${activeIssue.code}`);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  // If no issues exist at all (clean database / fresh test state)
  if (!activeIssue) {
    return (
      <div className="civic-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Header */}
        <div className="civic-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-amber)' }}>
              verified_user
            </span>
            <span style={{ fontSize: '12.5px', fontWeight: 700, letterSpacing: '0.02em', color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
              HUMAN VERIFICATION STATION
            </span>
          </div>
          <span className="civic-badge badge-neutral" style={{ fontSize: '11px' }}>
            0 PENDING
          </span>
        </div>

        {/* Empty / Standby Body */}
        <div style={{
          padding: '32px 20px',
          textAlign: 'center',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          backgroundColor: '#ffffff'
        }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            backgroundColor: 'var(--status-success-bg)',
            color: 'var(--status-success)',
            border: '1px solid var(--status-success-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-xs)'
          }}>
            <ShieldCheck size={28} />
          </div>

          <div>
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Verification Station Armed
            </h4>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '300px', lineHeight: 1.5 }}>
              Awaiting live camera or video detections. When road defects are detected, they will automatically dock here for single-click human authorization.
            </p>
          </div>

          {/* Real-time readiness checklist */}
          <div style={{
            width: '100%',
            maxWidth: '320px',
            backgroundColor: '#f8fafc',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 14px',
            textAlign: 'left',
            marginTop: '8px',
            fontSize: '11.5px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534' }}>
              <Check size={14} color="#16a34a" />
              <span>YOLOv8-Infra Neural Engine: <b>Standby</b></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534' }}>
              <Check size={14} color="#16a34a" />
              <span>GPS Corridor Matcher: <b>Threshold 22m</b></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534' }}>
              <Check size={14} color="#16a34a" />
              <span>Escalation Rule: <b>3-Pass Persistent Alert</b></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}>
              <span className="live-indicator-dot"></span>
              <span>Optical Feed: <b>Ready on Left</b></span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const severityClass = activeIssue.priority === 'CRITICAL' ? 'badge-critical' : activeIssue.priority === 'HIGH' ? 'badge-warning' : 'badge-neutral';
  const statusClass = activeIssue.status === 'VERIFIED' ? 'badge-success' : activeIssue.status === 'PENDING_VERIFICATION' ? 'badge-warning' : activeIssue.status === 'RESOLVED' ? 'badge-success' : 'badge-neutral';

  return (
    <div className="civic-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Station Header & Badges */}
      <div className="civic-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-amber)' }}>
            verified_user
          </span>
          <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
            HUMAN VERIFICATION STATION
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{
            fontSize: '10.5px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: 'var(--radius-xs)',
            backgroundColor: pendingIssues.length > 0 ? 'var(--accent-amber)' : '#f1f5f9',
            color: pendingIssues.length > 0 ? '#ffffff' : 'var(--text-muted)'
          }}>
            Pending ({pendingIssues.length})
          </span>
          <span style={{
            fontSize: '10.5px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: 'var(--radius-xs)',
            backgroundColor: '#f1f5f9',
            color: 'var(--text-secondary)'
          }}>
            Total ({issues.length})
          </span>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div style={{
          backgroundColor: '#f0fdf4',
          borderBottom: '1px solid #bbf7d0',
          color: '#166534',
          fontSize: '11.5px',
          fontWeight: 600,
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCheck size={14} color="#16a34a" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* Main Verification Content Area */}
      <div className="civic-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        
        {/* Top Identification Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12.5px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>
              {activeIssue.code || 'CV-DEFECT'}
            </span>
            <span className={`civic-badge ${statusClass}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
              <span className="civic-badge-dot"></span>
              {activeIssue.status?.replace('_', ' ')}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className={`civic-badge ${severityClass}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
              {activeIssue.priority}
            </span>
            {activeIssue.occurrences >= 2 && (
              <span className="civic-badge badge-critical" style={{ fontSize: '10px', padding: '2px 6px' }}>
                {activeIssue.occurrences}x PASSES
              </span>
            )}
          </div>
        </div>

        {/* Evidence Snapshot Frame */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: '165px',
          backgroundColor: '#0f172a',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--border-subtle)'
        }}>
          {activeIssue.evidenceImagePath ? (
            <img
              src={activeIssue.evidenceImagePath}
              alt="Defect evidence snapshot"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: '#64748b' }}>
              <AlertCircle size={28} />
              <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>No Frame Snapshot</span>
            </div>
          )}

          {/* Reticle ROI Crop Overlay */}
          <div style={{
            position: 'absolute',
            inset: '10px',
            border: '2px dashed rgba(220, 38, 38, 0.75)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-end',
            padding: '4px'
          }}>
            <span style={{
              backgroundColor: 'var(--status-critical)',
              color: '#ffffff',
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              padding: '2px 5px',
              fontWeight: 700,
              borderRadius: '2px'
            }}>
              ROI CROP · #{activeIssue.code}
            </span>
          </div>

          {/* Confidence Badge */}
          <div style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#22c55e',
            fontSize: '10.5px',
            fontFamily: 'var(--font-mono)',
            padding: '2px 8px',
            borderRadius: '2px',
            fontWeight: 700
          }}>
            CONF: {((activeIssue.confidence || 0.85) * 100).toFixed(1)}%
          </div>

          <div style={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            color: '#f8fafc',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            padding: '2px 6px',
            borderRadius: '2px'
          }}>
            {activeIssue.isSimulatedGps ? 'SIMULATED CORRIDOR' : 'LIVE GNSS'}
          </div>
        </div>

        {/* Title & Location details */}
        <div>
          <h3 style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
            {activeIssue.title}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '3px' }}>
            <MapPin size={12} color="var(--accent-amber)" style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeIssue.locationName}
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
            GPS: {activeIssue.latitude?.toFixed(5)}, {activeIssue.longitude?.toFixed(5)}
          </div>
        </div>

        {/* Defect Metrics Compact Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px',
          backgroundColor: '#f8fafc',
          padding: '8px 10px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
          fontSize: '11px'
        }}>
          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block' }}>Defect Type:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{activeIssue.defectType}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block' }}>Occurrences:</span>
            <span style={{ fontWeight: 700, color: activeIssue.occurrences >= 2 ? 'var(--status-critical)' : 'var(--text-primary)' }}>
              Pass #{activeIssue.occurrences || 1} {activeIssue.occurrences >= 2 ? '(Recurring)' : '(Initial)'}
            </span>
          </div>
          <div style={{ gridColumn: 'span 2', borderTop: '1px solid #e2e8f0', paddingTop: '4px', marginTop: '2px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Assigned Squad: </span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{activeIssue.assignedTo || 'DPW District 4 Maintenance'}</span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* OPERATOR ACTION BUTTONS (DIRECT ON-SCREEN OPTIONS)       */}
        {/* ======================================================== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' }}>
          
          {/* Primary Action Button */}
          {activeIssue.status === 'PENDING_VERIFICATION' && (
            <button
              id={`btn-verify-${activeIssue.code}`}
              className="civic-btn civic-btn-accent"
              style={{ width: '100%', height: '36px', fontSize: '12.5px', justifyContent: 'center' }}
              onClick={handleVerifyClick}
              disabled={isProcessing}
            >
              <CheckCircle2 size={16} />
              <span>Verify Hazard &amp; Dispatch Work Order</span>
            </button>
          )}

          {activeIssue.status === 'VERIFIED' && (
            <button
              id={`btn-dispatch-${activeIssue.code}`}
              className="civic-btn"
              style={{ 
                width: '100%', 
                height: '36px', 
                fontSize: '12.5px', 
                justifyContent: 'center',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: '1px solid #0369a1'
              }}
              onClick={() => handleStatusChange('IN_PROGRESS', 'Maintenance crew deployed on site')}
              disabled={isProcessing}
            >
              <Send size={15} />
              <span>Dispatch Repair Crew (Mark In Progress)</span>
            </button>
          )}

          {activeIssue.status === 'IN_PROGRESS' && (
            <button
              id={`btn-resolve-${activeIssue.code}`}
              className="civic-btn"
              style={{ 
                width: '100%', 
                height: '36px', 
                fontSize: '12.5px', 
                justifyContent: 'center',
                backgroundColor: '#16a34a',
                color: '#ffffff',
                border: '1px solid #15803d'
              }}
              onClick={() => handleStatusChange('RESOLVED', 'Physical road asphalt patched and verified')}
              disabled={isProcessing}
            >
              <CheckCheck size={16} />
              <span>Confirm Repaired &amp; Mark Resolved</span>
            </button>
          )}

          {activeIssue.status === 'RESOLVED' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 'var(--radius-xs)',
              color: '#166534',
              fontSize: '12px',
              fontWeight: 600
            }}>
              <CheckCircle2 size={15} color="#16a34a" />
              <span>Defect Repair Closed &amp; Verified in System</span>
            </div>
          )}

          {/* Secondary Action Options Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <button
              id={`btn-dismiss-${activeIssue.code}`}
              className="civic-btn civic-btn-outline"
              style={{ height: '32px', fontSize: '11px', justifyContent: 'center' }}
              onClick={handleRejectClick}
              disabled={isProcessing}
              title="Dismiss detection as false positive"
            >
              <XCircle size={14} color="#dc2626" />
              <span>Dismiss Defect</span>
            </button>

            <button
              id={`btn-recheck-${activeIssue.code}`}
              className="civic-btn civic-btn-outline"
              style={{ height: '32px', fontSize: '11px', justifyContent: 'center' }}
              onClick={handleRecheckClick}
              disabled={isProcessing}
              title="Run AI camera resolution re-check"
            >
              <RefreshCw size={13} className={isProcessing ? 'radar-sweep' : ''} />
              <span>AI Re-Check</span>
            </button>
          </div>

          {/* Quick Manual Status Changer Options */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 8px',
            backgroundColor: '#ffffff',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-xs)',
            fontSize: '11px',
            marginTop: '2px'
          }}>
            <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Sliders size={12} />
              <span>Override Status:</span>
            </span>

            <div style={{ display: 'flex', gap: '4px' }}>
              {activeIssue.status !== 'VERIFIED' && (
                <button
                  onClick={() => handleStatusChange('VERIFIED', 'Manually marked verified')}
                  style={{
                    fontSize: '10.5px',
                    padding: '2px 6px',
                    borderRadius: '2px',
                    backgroundColor: '#f1f5f9',
                    color: 'var(--text-secondary)',
                    fontWeight: 600
                  }}
                >
                  Verify
                </button>
              )}
              {activeIssue.status !== 'IN_PROGRESS' && (
                <button
                  onClick={() => handleStatusChange('IN_PROGRESS', 'Squad dispatched')}
                  style={{
                    fontSize: '10.5px',
                    padding: '2px 6px',
                    borderRadius: '2px',
                    backgroundColor: '#f1f5f9',
                    color: 'var(--text-secondary)',
                    fontWeight: 600
                  }}
                >
                  Progress
                </button>
              )}
              {activeIssue.status !== 'RESOLVED' && (
                <button
                  onClick={() => handleStatusChange('RESOLVED', 'Issue resolved')}
                  style={{
                    fontSize: '10.5px',
                    padding: '2px 6px',
                    borderRadius: '2px',
                    backgroundColor: '#f1f5f9',
                    color: 'var(--text-secondary)',
                    fontWeight: 600
                  }}
                >
                  Resolve
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Compact Queue Switcher (Defects Waiting for Inspection) */}
        {issues.length > 1 && (
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '8px', marginTop: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                Defect Queue ({issues.length} items)
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                Click item to inspect
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '110px', overflowY: 'auto' }}>
              {issues.map(iss => {
                const isCurrent = activeIssue.id === iss.id;
                return (
                  <div
                    key={iss.id}
                    onClick={() => onSelectIssue(iss)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '5px 8px',
                      borderRadius: 'var(--radius-xs)',
                      backgroundColor: isCurrent ? '#f1f5f9' : '#fafbfc',
                      border: isCurrent ? '1px solid var(--accent-amber)' : '1px solid #f1f5f9',
                      cursor: 'pointer',
                      fontSize: '11px',
                      transition: 'all 0.1s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                      <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: iss.priority === 'CRITICAL' ? 'var(--status-critical)' : iss.status === 'VERIFIED' ? 'var(--status-success)' : 'var(--accent-amber)',
                        flexShrink: 0
                      }}></span>
                      <span style={{ fontWeight: isCurrent ? 700 : 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {iss.code} · {iss.title}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <span style={{
                        fontSize: '9.5px',
                        fontFamily: 'var(--font-mono)',
                        padding: '1px 4px',
                        borderRadius: '2px',
                        backgroundColor: iss.status === 'VERIFIED' ? '#dcfce7' : iss.status === 'PENDING_VERIFICATION' ? '#fef3c7' : '#f1f5f9',
                        color: iss.status === 'VERIFIED' ? '#166534' : iss.status === 'PENDING_VERIFICATION' ? '#92400e' : '#475569'
                      }}>
                        {iss.status === 'PENDING_VERIFICATION' ? 'PENDING' : iss.status}
                      </span>
                      <ChevronRight size={12} color="#94a3b8" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
