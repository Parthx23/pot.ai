import React from 'react';

export default function StatsBar({ stats = {}, issues = [], selectedFilter, onSelectFilter }) {
  // Dynamically compute counts by defect category from actual real data
  const totalIssues = issues.length > 0 ? issues.length : (stats.totalDetected || 0);

  const potholesList = issues.filter(i => 
    i.defectType?.includes('POTHOLE') || i.rawClass?.toLowerCase().includes('pothole') || i.title?.toLowerCase().includes('pothole')
  );
  const potholesCount = potholesList.length;
  const criticalPotholes = potholesList.filter(i => i.priority === 'CRITICAL' || i.severity === 'CRITICAL').length;

  const damagedRoadsList = issues.filter(i => 
    i.defectType?.includes('ROAD_') || i.defectType?.includes('SURFACE') || i.defectType?.includes('PAVEMENT') || i.title?.toLowerCase().includes('crack') || i.title?.toLowerCase().includes('subsidence') || i.title?.toLowerCase().includes('damaged')
  );
  const damagedRoadsCount = damagedRoadsList.length;

  const streetlightsList = issues.filter(i => 
    i.defectType?.includes('LIGHT') || i.defectType?.includes('TRAFFIC') || i.title?.toLowerCase().includes('light')
  );
  const streetlightsCount = streetlightsList.length;

  const persistentList = issues.filter(i => (i.occurrences && i.occurrences >= 2) || i.status === 'ESCALATED');
  const persistentCount = persistentList.length > 0 ? persistentList.length : (stats.persistent || 0);

  const metrics = [
    {
      id: 'ALL',
      label: 'TOTAL DETECTED ISSUES',
      value: totalIssues,
      icon: 'assessment',
      tag: totalIssues > 0 ? `+${totalIssues} active` : '0 active',
      tagType: totalIssues > 0 ? 'accent' : 'neutral',
      detail: totalIssues > 0 ? 'Corridor 101, Mission, 4th Ave' : 'Corridor Scan Ready'
    },
    {
      id: 'POTHOLE',
      label: 'POTHOLES',
      value: potholesCount,
      icon: 'warning',
      tag: `${criticalPotholes} Critical`,
      tagType: criticalPotholes > 0 ? 'critical' : 'neutral',
      detail: potholesCount > 0 ? 'Avg. Depth: 6.2cm · Impact High' : 'Zero potholes detected'
    },
    {
      id: 'ROAD',
      label: 'DAMAGED ROADS',
      value: damagedRoadsCount,
      icon: 'alt_route',
      tag: damagedRoadsCount > 0 ? 'Moderate' : 'Nominal',
      tagType: damagedRoadsCount > 0 ? 'neutral' : 'neutral',
      detail: damagedRoadsCount > 0 ? 'Linear fissures & subsidence' : 'Zero surface damage'
    },
    {
      id: 'LIGHT',
      label: 'BROKEN STREETLIGHTS',
      value: streetlightsCount,
      icon: 'lightbulb',
      tag: streetlightsCount > 0 ? 'High Severity' : 'Operational',
      tagType: streetlightsCount > 0 ? 'warning' : 'neutral',
      detail: streetlightsCount > 0 ? 'Tilt alerts & dark zones' : 'All lighting active'
    },
    {
      id: 'PERSISTENT',
      label: 'ACTIVE / PERSISTENT',
      value: persistentCount,
      icon: 'schedule',
      tag: persistentCount > 0 ? 'Pending Dispatch' : 'Clear',
      tagType: persistentCount > 0 ? 'warning-subtle' : 'neutral',
      detail: persistentCount > 0 ? `${persistentCount} work orders queued` : 'Zero persistent defects'
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
              backgroundColor: isActive ? '#fffcf8' : '#ffffff',
              transition: 'all 0.15s ease'
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
                fontWeight: 600,
                color: 'var(--text-secondary)',
                letterSpacing: '0.04em'
              }}>
                {metric.label}
              </span>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--text-muted)' }}>
                {metric.icon}
              </span>
            </div>

            {/* Metric Value & Tag */}
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              margin: '4px 0'
            }}>
              <span style={{
                fontSize: '28px',
                fontWeight: 800,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-primary)',
                lineHeight: 1
              }}>
                {metric.value}
              </span>

              <span className={`civic-badge badge-${metric.tagType}`} style={{ fontSize: '10.5px' }}>
                {metric.tag}
              </span>
            </div>

            {/* Sub-label / Detail */}
            <div style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              marginTop: '4px'
            }}>
              {metric.detail}
            </div>
          </div>
        );
      })}
    </section>
  );
}
