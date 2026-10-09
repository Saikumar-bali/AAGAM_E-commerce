'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getMapboxToken } from '@/lib/mapbox';

export type ConsoleStopStatus =
  | 'PLANNED'
  | 'READY'
  | 'ARRIVED'
  | 'DELIVERED'
  | 'FAILED'
  | 'RETRY_PENDING'
  | 'RETURN_REQUIRED'
  | 'RETURNED'
  | 'CANCELLED';

export interface ConsoleStop {
  id: string;
  sequenceNumber: number;
  status: ConsoleStopStatus;
  latitude: number;
  longitude: number;
  approximate?: boolean;
  customerName: string;
  litres: number | null;
  cashDuePaise: number;
  parcelCount: number;
}

export interface RiderRunConsoleMapProps {
  stores: Array<{ name: string; latitude: number | null; longitude: number | null }>;
  stops: ConsoleStop[];
  activeStopId: string | null;
  /** Show every label, or only focus (active + next 3). */
  showAllLabels: boolean;
  filter: 'ALL' | 'UNDELIVERED' | 'DELIVERED' | 'FAILED' | 'COD';
  showRoute: boolean;
  followRider: boolean;
  /** Bumping this recenters on the active stop. */
  centerSignal: number;
  fitSignal: number;
  /** Live rider position (from the assignment route-board). */
  riderPosition?: { latitude: number; longitude: number } | null;
  onSelectStop: (id: string) => void;
  onFocusSettled?: () => void;
}

const TERMINAL: ConsoleStopStatus[] = ['DELIVERED', 'FAILED', 'CANCELLED'];
const DELIVERED = new Set<ConsoleStopStatus>(['DELIVERED']);
const FAILED = new Set<ConsoleStopStatus>(['FAILED', 'RETURN_REQUIRED', 'RETURNED']);

/** Matches the console's filter semantics so hidden pins dim rather than vanish. */
export function stopMatchesFilter(
  status: ConsoleStopStatus,
  cashDuePaise: number,
  filter: RiderRunConsoleMapProps['filter'],
): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'DELIVERED') return DELIVERED.has(status);
  if (filter === 'FAILED') return FAILED.has(status);
  if (filter === 'COD') return cashDuePaise > 0;
  return !TERMINAL.includes(status);
}

function hexForStatus(status: ConsoleStopStatus, active: boolean) {
  if (active) return '#ec6b4d'; // coral "live" stop
  if (status === 'DELIVERED') return '#0f766e'; // pine
  if (status === 'ARRIVED') return '#d97706'; // amber
  if (FAILED.has(status)) return '#dc2626'; // red
  return '#64748b'; // slate pending
}

function ringForStatus(status: ConsoleStopStatus, dimmed: boolean) {
  if (dimmed) return 'opacity:0.35;filter:grayscale(0.5);';
  if (status === 'DELIVERED') return '';
  if (status === 'ARRIVED') return 'animation:rc-pulse 1.6s ease-in-out infinite;';
  return '';
}

function pinElement(stop: ConsoleStop, active: boolean, next: boolean, dimmed: boolean, label: string | null) {
  const el = document.createElement('div');
  el.className = 'rc-pin';
  el.style.cssText =
    'position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;' +
    ringForStatus(stop.status, dimmed);

  const marker = document.createElement('div');
  marker.style.cssText =
    `position:relative;display:flex;align-items:center;justify-content:center;` +
    `width:${active ? 38 : 32}px;height:${active ? 38 : 32}px;border-radius:9999px;` +
    `background:${hexForStatus(stop.status, active)};color:#fff;` +
    `font-weight:700;font-size:${active ? 15 : 13}px;line-height:1;` +
    `box-shadow:0 4px 12px rgba(15,23,42,.35);border:2px solid #fff;`;
  if (next) marker.style.boxShadow = '0 0 0 6px rgba(236,107,77,.28),0 4px 12px rgba(15,23,42,.35)';
  if (stop.status === 'DELIVERED') {
    marker.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  } else {
    marker.textContent = String(stop.sequenceNumber);
  }
  el.appendChild(marker);

  // Directional tail: active + delivered + arrived pins get a small pointer.
  if (active || stop.status === 'DELIVERED' || stop.status === 'ARRIVED') {
    const tail = document.createElement('div');
    tail.style.cssText =
      `width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;` +
      `border-top:7px solid ${hexForStatus(stop.status, active)};margin-top:-2px;`;
    el.appendChild(tail);
  }

  if (label) {
    const pill = document.createElement('div');
    pill.style.cssText =
      'margin-top:4px;white-space:nowrap;background:rgba(255,255,255,.96);' +
      'border:1px solid rgba(15,23,42,.12);border-radius:9999px;padding:2px 8px;' +
      'font-size:11px;font-weight:700;color:#0f172a;box-shadow:0 2px 6px rgba(15,23,42,.12);';
    pill.textContent = label;
    el.appendChild(pill);
  }
  return el;
}

function riderElement() {
  const el = document.createElement('div');
  el.style.cssText = 'width:18px;height:18px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 4px rgba(37,99,235,.25);';
  return el;
}

const RiderRunConsoleMap: React.FC<RiderRunConsoleMapProps> = ({
  stores,
  stops,
  activeStopId,
  showAllLabels,
  filter,
  showRoute,
  followRider,
  centerSignal,
  fitSignal,
  riderPosition,
  onSelectStop,
  onFocusSettled,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const readyRef = useRef(false);

  // ------------------------------------------------------------- render pins
  const focusIds = React.useMemo(() => {
    const pending = stops.filter((stop) => !TERMINAL.includes(stop.status));
    const next = pending[0];
    return new Set(
      [activeStopId, ...pending.slice(0, 4).map((stop) => stop.id), next?.id].filter(
        (value): value is string => Boolean(value),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, activeStopId]);

  const renderMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    stores.forEach((store) => {
      if (store.latitude == null || store.longitude == null) return;
      const el = document.createElement('div');
      el.style.cssText =
        'display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;background:#0f766e;color:#fff;border:2px solid #fff;box-shadow:0 3px 8px rgba(15,23,42,.3);font-size:13px;';
      el.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 9l2-4h12l2 4M5 9h14v10H5z" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg>';
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([store.longitude, store.latitude])
        .setPopup(new mapboxgl.Popup({ offset: 18 }).setText(store.name))
        .addTo(map);
      markersRef.current.push(marker);
    });

    const pending = stops.filter((stop) => !TERMINAL.includes(stop.status));
    const nextId = pending[0]?.id ?? null;
    const handler = onSelectStop;

    stops.forEach((stop) => {
      const dimmed = !stopMatchesFilter(stop.status, stop.cashDuePaise, filter);
      const active = stop.id === activeStopId;
      const isNext = stop.id === nextId && !active;
      const label = focusIds.has(stop.id) || showAllLabels
        ? `${stop.sequenceNumber} · ${stop.customerName.split(' ')[0]}${stop.litres != null ? ` · ${stop.litres}L` : ''}`
        : null;
      const el = pinElement(stop, active, isNext, dimmed, label);
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        handler(stop.id);
      });
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([stop.longitude, stop.latitude])
        .addTo(map);
      marker.getElement().style.zIndex = active ? '5' : isNext ? '4' : '1';
      markersRef.current.push(marker);
    });

    if (riderPosition) {
      const marker = new mapboxgl.Marker({ element: riderElement(), anchor: 'center' })
        .setLngLat([riderPosition.longitude, riderPosition.latitude])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [stores, stops, activeStopId, showAllLabels, filter, focusIds, riderPosition, onSelectStop]);

  // ------------------------------------------------------------ render route
  const renderRoute = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const source = map.getSource('rc-route') as mapboxgl.GeoJSONSource | undefined;
    if (!showRoute) {
      if (map.getLayer('rc-route-line')) map.removeLayer('rc-route-line');
      if (source) map.removeSource('rc-route');
      return;
    }
    const coords = stops
      .filter((stop) => !TERMINAL.includes(stop.status))
      .slice()
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
      .map((stop) => [stop.longitude, stop.latitude]);
    if (coords.length < 2) {
      source?.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords },
    };
    if (source) {
      source.setData(geojson);
    } else {
      map.addSource('rc-route', { type: 'geojson', data: geojson });
      map.addLayer({
        id: 'rc-route-line',
        type: 'line',
        source: 'rc-route',
        paint: { 'line-color': '#0f766e', 'line-width': 3, 'line-opacity': 0.55, 'line-dasharray': [1.5, 1.5] },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    }
  }, [showRoute, stops]);

  const fitRoute = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !stops.length) return;
    const bounds = new mapboxgl.LngLatBounds();
    stops.forEach((stop) => bounds.extend([stop.longitude, stop.latitude]));
    stores.forEach((store) => {
      if (store.latitude != null && store.longitude != null) bounds.extend([store.longitude, store.latitude]);
    });
    if (riderPosition) bounds.extend([riderPosition.longitude, riderPosition.latitude]);
    if (bounds.isEmpty()) return;
    map.fitBounds(bounds, { padding: { top: 90, bottom: 260, left: 60, right: 60 }, maxZoom: 15, duration: 650 });
  }, [stops, stores, riderPosition]);

  useEffect(() => {
    renderMarkers();
  }, [renderMarkers]);

  useEffect(() => {
    renderRoute();
  }, [renderRoute]);

  // ---------------------------------------------------------------- init map
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const token = getMapboxToken();
    if (!token) {
      container.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:13px;text-align:center;padding:24px;">Map unavailable – missing Mapbox token (NEXT_PUBLIC_MAPBOX_TOKEN)</div>';
      return;
    }
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [78.4, 17.4],
      zoom: 11,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('load', () => {
      readyRef.current = true;
      map.resize();
      renderMarkers();
      renderRoute();
      fitRoute();
    });
    mapRef.current = map;
    return () => {
      readyRef.current = false;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the canvas sized to its (sometimes animated) container.
  useEffect(() => {
    const container = containerRef.current;
    const map = mapRef.current;
    if (!container || !map || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Center on active stop when requested.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !centerSignal) return;
    const active = stops.find((stop) => stop.id === activeStopId);
    if (active) map.easeTo({ center: [active.longitude, active.latitude], zoom: Math.max(map.getZoom(), 15), duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerSignal]);

  // Fit whole route when requested.
  useEffect(() => {
    if (!fitSignal) return;
    fitRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

  // Follow the active stop as it advances.
  useEffect(() => {
    if (!followRider) return;
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const active = stops.find((stop) => stop.id === activeStopId);
    if (active) map.easeTo({ center: [active.longitude, active.latitude], duration: 600 });
    onFocusSettled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followRider, activeStopId]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" data-testid="rider-run-console-map" />
      <style jsx global>{`
        @keyframes rc-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        .mapboxgl-popup-content { border-radius: 12px; padding: 8px 10px; font-weight: 600; }
        .mapboxgl-ctrl-bottom-right { margin-bottom: 8px; }
      `}</style>
    </div>
  );
};

export default RiderRunConsoleMap;
