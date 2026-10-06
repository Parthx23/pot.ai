import React from 'react';
import { Search, Filter, AlertTriangle } from 'lucide-react';

export default function IssueListTable({
  issues = [],
  selectedIssue,
  onSelectIssue,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange
}) {
  return (
    <div className="civic-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Title & Filter Bar */}
      <div className="civic-card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>
            table_chart
          </span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            INFRASTRUCTURE DEFECT INVENTORY ({issues.length})
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Search box */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#ffffff',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-xs)',
            padding: '4px 8px',
            fontSize: '12px'
          }}>
            <Search size={13} color="#94a3b8" style={{ marginRight: '6px' }} />
            <input
              type="text"
              placeholder="Search ID, route, type..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                width: '140px',
                fontSize: '12px'
              }}
            />
          </div>

          {/* Status selector */}
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xs)',
              color: 'var(--text-primary)',
              padding: '4px 8px',
              fontSize: '12px',
              fontFamily: 'inherit'
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING_VERIFICATION">Pending Verification</option>
            <option value="VERIFIED">Verified</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="ESCALATED">Escalated</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>
      </div>

      {/* Issues Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {issues.length === 0 ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No infrastructure defects match current filters.
          </div>
        ) : (
          <table className="civic-table">
            <thead>
              <tr>
                <th style={{ width: '85px' }}>DEFECT ID</th>
                <th>CLASSIFICATION</th>
                <th style={{ width: '130px' }}>STATUS</th>
                <th style={{ width: '90px' }}>PASSES</th>
                <th style={{ width: '90px' }}>SEVERITY</th>
                <th>LOCATION</th>
              </tr>
            </thead>
            <tbody>
              {issues.map(iss => {
                const isSelected = selectedIssue?.id === iss.id;
                let badgeClass = 'badge-neutral';
                if (iss.status === 'VERIFIED') badgeClass = 'badge-success';
                else if (iss.status === 'PENDING_VERIFICATION') badgeClass = 'badge-warning';
                else if (iss.status === 'ESCALATED') badgeClass = 'badge-critical';
                else if (iss.status === 'RESOLVED') badgeClass = 'badge-success';

                let priorityClass = 'badge-neutral';
                if (iss.priority === 'CRITICAL') priorityClass = 'badge-critical';
                else if (iss.priority === 'HIGH') priorityClass = 'badge-warning';

                return (
                  <tr
                    key={iss.id}
                    id={`issue-row-${iss.code}`}
                    onClick={() => onSelectIssue(iss)}
                    style={{
                      backgroundColor: isSelected ? '#f1f5f9' : 'transparent',
                      cursor: 'pointer'
                    }}
                  >
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '11.5px' }}>
                      {iss.code}
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {iss.title}
                    </td>
                    <td>
                      <span className={`civic-badge ${badgeClass}`}>
                        <span className="civic-badge-dot"></span>
                        {iss.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: iss.occurrences >= 2 ? 'var(--status-critical)' : 'var(--text-secondary)'
                      }}>
                        {iss.occurrences}x {iss.occurrences >= 2 ? 'RECURRING' : ''}
                      </span>
                    </td>
                    <td>
                      <span className={`civic-badge ${priorityClass}`}>
                        {iss.priority}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                      {iss.locationName}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
