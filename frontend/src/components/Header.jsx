import React, { useState, useEffect } from 'react';
import { Shield, RefreshCw } from 'lucide-react';

export default function Header({ activeScreen, onSelectScreen, onReset, isResetting, stats }) {
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour12: false }) + ' PST');
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'monitor', label: 'Monitor', icon: 'videocam' },
    { id: 'issues', label: 'Issue Details', icon: 'assignment_late' },
    { id: 'map', label: 'Map', icon: 'map' },
  ];

  return (
    <header className="civic-card" style={{
      borderRadius: 0,
      borderTop: 'none',
      borderLeft: 'none',
      borderRight: 'none',
      borderBottom: '1px solid var(--border-subtle)',
      backgroundColor: '#ffffff',
      padding: '0 24px',
      height: '56px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      boxShadow: 'var(--shadow-xs)'
    }}>
      {/* Brand / Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: '#0f172a',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow-xs)'
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>shield</span>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', fontFamily: 'var(--font-heading)' }}>
              ROADAUDIT MUNICIPAL CV
            </span>
            <span style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              backgroundColor: '#f1f5f9',
              color: 'var(--text-muted)',
              padding: '2px 6px',
              borderRadius: 'var(--radius-xs)'
            }}>
              DPW-DISTRICT 4
            </span>
          </div>
        </div>
      </div>

      {/* Central Navigation Tabs */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '100%' }}>
        {navItems.map(item => {
          const isActive = activeScreen === item.id;
          return (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              onClick={() => onSelectScreen(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                height: '100%',
                padding: '0 16px',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderBottom: isActive ? '2px solid var(--accent-amber)' : '2px solid transparent',
                background: 'transparent',
                transition: 'all 0.15s ease'
              }}
            >
              <span className="material-symbols-outlined" style={{
                fontSize: '18px',
                color: isActive ? 'var(--accent-amber)' : 'var(--text-muted)'
              }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Right Telemetry & Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Vision Engine status chip */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: 'var(--radius-xs)',
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          color: '#166534'
        }}>
          <span className="live-indicator-dot"></span>
          <span style={{ fontWeight: 600 }}>Vision Engine Online</span>
          <span style={{ color: '#86efac' }}>|</span>
          <span style={{ color: '#15803d' }}>YOLOv8-Infra (ONNX)</span>
        </div>

        {/* Fleet unit status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 10px',
          borderRadius: 'var(--radius-xs)',
          backgroundColor: '#f8fafc',
          border: '1px solid var(--border-subtle)',
          fontSize: '11px',
          color: 'var(--text-secondary)'
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '15px', color: 'var(--accent-amber)' }}>
            sensors
          </span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Unit 402 - Active</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{currentTime}</span>
        </div>

        {/* Clear Cache & Reset button */}
        <button
          id="btn-reset-demo"
          className="civic-btn civic-btn-outline"
          onClick={onReset}
          disabled={isResetting}
          style={{ height: '30px', padding: '0 10px', fontSize: '11.5px', color: '#dc2626', borderColor: '#fecaca' }}
          title="Clear all database records, evidence cache, and start from scratch"
        >
          <RefreshCw size={13} className={isResetting ? 'radar-sweep' : ''} />
          <span>{isResetting ? 'Clearing...' : 'Clear Cache & Reset'}</span>
        </button>
      </div>
    </header>
  );
}
