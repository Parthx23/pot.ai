import React from 'react';

export default function StatsBar({ stats = {}, issues = [], selectedFilter, onSelectFilter }) {
  // Dynamically compute counts by defect category
  const totalIssues = issues.length > 0 ? issues.length : (stats.totalDetected || 148);

  const potholesList = issues.filter(i => 
    i.defectType?.includes('POTHOLE') || i.rawClass?.toLowerCase().includes('pothole') || i.title?.toLowerCase().includes('pothole')
  );
  const potholesCount = potholesList.length > 0 ? potholesList.length : (stats.potholesCount || 84);
  const criticalPotholes = potholesList.filter(i => i.priority === 'CRITICAL' || i.severity === 'CRITICAL').length || 18;

  const damagedRoadsList = issues.filter(i => 
    i.defectType?.includes('ROAD_') || i.defectType?.includes('SURFACE') || i.defectType?.includes('PAVEMENT') || i.title?.toLowerCase().includes('crack') || i.title?.toLowerCase().includes('subsidence')
  );
  const damagedRoadsCount = damagedRoadsList.length > 0 ? damagedRoadsList.length : (stats.damagedRoadsCount || 42);

  const streetlightsList = issues.filter(i => 
    i.defectType?.includes('LIGHT') || i.defectType?.includes('TRAFFIC') || i.title?.toLowerCase().includes('light')
  );
  const streetlightsCount = streetlightsList.length > 0 ? streetlightsList.length : (stats.streetlightsCount || 22);

  const persistentList = issues.filter(i => (i.occurrences && i.occurrences >= 2) || i.status === 'ESCALATED');
  const persistentCount = persistentList.length > 0 ? persistentList.length : (stats.persistent || 19);

  const metrics = [
    {
      id: 'ALL',
      label: 'Total Detected Issues',
      value: totalIssues,
      icon: 'assessment',
      tag: '+12 today',
      tagType: 'accent',
      detail: 'Corridor 101, Mission, 4th Ave'
    },
    {
      id: 'POTHOLE',
      label: 'Potholes',
      value: potholesCount,
      icon: 'warning',
      tag: `${criticalPotholes} Critical`,
      tagType: 'critical',
      detail: 'Avg. Depth: 6.2cm · Impact High'
    },
    {
      id: 'ROAD',
      label: 'Damaged Roads',
      value: damagedRoadsCount,
      icon: 'alt_route',
      tag: 'Moderate',
      tagType: 'neutral',
      detail: 'Linear fissures & subsidence'
    },
    {
      id: 'LIGHT',
      label: 'Broken Streetlights',
      value: streetlightsCount,
      icon: 'lightbulb',
      tag: 'High Severity',
      tagType: 'warning',
      detail: 'Tilt alerts & dark zones'
    },
    {
      id: 'PERSISTENT',
      label: 'Active / Persistent',
      value: persistentCount,
      icon: 'schedule',
      tag: 'Pending Dispatch',
      tagType: 'warning-subtle',
      detail: '4 work orders queued'
    }
  ];

  return (
    <section style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '12px',
      marginBottom: '16px'
    }}>
      {metrics.map(metric => {
        const isActive = selectedFilter === metric.id;
        return (
          <div
            key={metric.id}
            id={`metric-card-${metric.id.toLowerCase()}`}
            onClick={() => onSelectFilter && onSelectFilter(metric.id)}
            className="civic-card"
            style={{
              padding: '12px 14px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              border: isActive ? '1px solid var(--accent-amber)' : '1px solid var(--border-subtle)',
              backgroundColor: isActive ? '#fffcf8' : '#ffffff'
            }}
          >
            {/* Card Top Label & Icon */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #f1f5f9',
              paddingBottom: '6px',
              marginBottom: '6px'
            }}>
              <span style={{
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                letterSpacing: '0.04em'
              }}>
                {metric.label}
              </span>
              <span className="material-symbols-outlined" style={{ fontSize: '15px', color: 'var(--text-muted)' }}>
                {metric.icon}
              </span>
            </div>

            {/* Metric Value & Tag */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '2px' }}>
              <span style={{
                fontSize: '26px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-heading)',
                lineHeight: 1
              }}>
                {metric.value}
              </span>

              {metric.tagType === 'critical' && (
                <span className="civic-badge badge-critical" style={{ fontSize: '10.5px' }}>
                  <span className="civic-badge-dot"></span>
                  {metric.tag}
                </span>
              )}

              {metric.tagType === 'accent' && (
                <span style={{
                  fontSize: '10.5px',
                  fontWeight: 600,
                  color: 'var(--accent-amber)',
                  backgroundColor: 'var(--accent-amber-light)',
                  border: '1px solid var(--accent-amber-border)',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px'
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>trending_up</span>
                  {metric.tag}
                </span>
              )}

              {metric.tagType === 'warning' && (
                <span className="civic-badge badge-warning" style={{ fontSize: '10.5px' }}>
                  <span className="civic-badge-dot"></span>
                  {metric.tag}
                </span>
              )}

              {metric.tagType === 'warning-subtle' && (
                <span style={{
                  fontSize: '10.5px',
                  fontWeight: 500,
                  color: 'var(--accent-amber-text)',
                  backgroundColor: '#fef3c7',
                  border: '1px solid #fde68a',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-xs)'
                }}>
                  {metric.tag}
                </span>
              )}

              {metric.tagType === 'neutral' && (
                <span className="civic-badge badge-neutral" style={{ fontSize: '10.5px' }}>
                  {metric.tag}
                </span>
              )}
            </div>

            {/* Context Detail */}
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
              {metric.detail}
            </div>
          </div>
        );
      })}
    </section>
  );
}
