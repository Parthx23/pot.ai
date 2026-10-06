import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

const CARTO_API_KEY = (import.meta.env.VITE_CARTO_API_KEY || 'cb1_4bfk_1_5520b30f927dc6d4b55572b8').trim();

const CARTO_STYLES = {
  voyager: {
    id: 'voyager',
    name: 'CARTO Voyager',
    icon: 'explore',
    url: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  positron: {
    id: 'positron',
    name: 'CARTO Positron',
    icon: 'light_mode',
    url: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  dark: {
    id: 'dark',
    name: 'CARTO Dark Matter',
    icon: 'dark_mode',
    url: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  osm: {
    id: 'osm',
    name: 'OSM Standard',
    icon: 'public',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }
};

export default function InteractiveMap({ issues = [], selectedIssue, onSelectIssue }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersRef = useRef({});
  const [activeStyle, setActiveStyle] = useState('voyager');

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const defaultCenter = [37.774929, -122.419416];
      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 15,
        zoomControl: true,
      });

      // CARTO Basemap tile layer authenticated with API key (?key=)
      const initialStyle = CARTO_STYLES[activeStyle] || CARTO_STYLES.voyager;
      const initialLayer = L.tileLayer(initialStyle.url, {
        attribution: initialStyle.attribution,
        subdomains: initialStyle.id === 'osm' ? 'abc' : 'abcd',
        maxZoom: 20
      }).addTo(map);

      tileLayerRef.current = initialLayer;
      mapInstanceRef.current = map;

      // Invalidate size to ensure clean tile rendering
      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }

    return () => {
      // Map cleanup if container unmounts
    };
  }, []);

  // Handle Basemap style changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const selectedStyle = CARTO_STYLES[activeStyle] || CARTO_STYLES.voyager;
    const newLayer = L.tileLayer(selectedStyle.url, {
      attribution: selectedStyle.attribution,
      subdomains: selectedStyle.id === 'osm' ? 'abc' : 'abcd',
      maxZoom: 20
    }).addTo(map);

    tileLayerRef.current = newLayer;
  }, [activeStyle]);

  // Update Markers & Bounds
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Clear existing markers
    Object.values(markersRef.current).forEach(marker => marker.remove());
    markersRef.current = {};

    if (issues.length === 0) return;

    const bounds = L.latLngBounds();

    issues.forEach(issue => {
      const lat = issue.latitude;
      const lon = issue.longitude;
      if (!lat || !lon) return;

      bounds.extend([lat, lon]);

      // Determine marker color
      let markerColor = '#d97706'; // municipal amber
      if (issue.status === 'RESOLVED') markerColor = '#16a34a';
      else if (issue.status === 'ESCALATED' || issue.priority === 'CRITICAL') markerColor = '#dc2626';
      else if (issue.priority === 'HIGH') markerColor = '#ea580c';
      else if (issue.status === 'VERIFIED') markerColor = '#16a34a';

      const isSelected = selectedIssue && selectedIssue.id === issue.id;
      const size = isSelected ? 30 : 22;

      const iconHtml = `
        <div style="
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background: ${markerColor};
          border: 2px solid #ffffff;
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 700;
          font-size: 10px;
          font-family: 'JetBrains Mono', monospace;
          cursor: pointer;
          transform: translate(-50%, -50%);
        ">
          ${issue.occurrences > 1 ? issue.occurrences : ''}
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'civic-map-pin',
        html: iconHtml,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });

      const marker = L.marker([lat, lon], { icon: customIcon }).addTo(map);

      marker.on('click', () => {
        if (onSelectIssue) onSelectIssue(issue);
      });

      // Bind popup
      const popupHtml = `
        <div style="font-size: 12px; line-height: 1.4; font-family: 'Inter', sans-serif;">
          <div style="font-weight: 700; font-size: 13px; margin-bottom: 2px; color: #0f172a;">
            ${issue.code} · ${issue.title}
          </div>
          <div style="color: #64748b; font-size: 11px; margin-bottom: 6px;">
            ${issue.locationName}
          </div>
          <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px;">
            <span style="background: #f1f5f9; color: #0f172a; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 600;">
              STATUS: ${issue.status}
            </span>
            <span style="background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 600;">
              ${issue.priority}
            </span>
            <span style="background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 600;">
              ${issue.occurrences}x PASSES
            </span>
          </div>
          <div style="font-size: 10.5px; color: #64748b; font-family: monospace;">
            GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}
          </div>
        </div>
      `;
      marker.bindPopup(popupHtml);

      markersRef.current[issue.id] = marker;
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [issues, selectedIssue, onSelectIssue]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '380px' }}>
      <div id="interactive-map" ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Floating CARTO Controls Bar */}
      <div style={{
        position: 'absolute',
        top: '12px',
        left: '52px',
        zIndex: 500,
        backgroundColor: '#ffffff',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        padding: '4px 8px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          paddingRight: '8px',
          borderRight: '1px solid var(--border-subtle)',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-secondary)'
        }}>
          <span style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            backgroundColor: '#16a34a',
            display: 'inline-block'
          }}></span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>CARTO</span>
        </div>

        {Object.entries(CARTO_STYLES).map(([key, style]) => {
          const isActive = activeStyle === key;
          return (
            <button
              key={key}
              onClick={() => setActiveStyle(key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: 'var(--radius-xs)',
                border: 'none',
                fontSize: '11px',
                fontWeight: isActive ? 600 : 500,
                backgroundColor: isActive ? 'var(--accent-amber)' : 'transparent',
                color: isActive ? '#ffffff' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title={style.name}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                {style.icon}
              </span>
              <span>{style.name.replace('CARTO ', '')}</span>
            </button>
          );
        })}
      </div>

      {/* Floating Legend */}
      <div style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        zIndex: 500,
        backgroundColor: '#ffffff',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        padding: '8px 12px',
        boxShadow: 'var(--shadow-sm)',
        fontSize: '11px',
        color: 'var(--text-secondary)',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
      }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px', fontFamily: 'var(--font-mono)' }}>
          CORRIDOR DEFECT LEGEND
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#dc2626' }}></span>
          <span>Critical / Potholes</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ea580c' }}></span>
          <span>High / Broken Streetlights</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#d97706' }}></span>
          <span>Moderate / Damaged Roads</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#16a34a' }}></span>
          <span>Verified for Work Order</span>
        </div>
      </div>
    </div>
  );
}
