'use client';

import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getMapboxToken } from '@/lib/mapbox';

function createRiderEl(): HTMLElement {
  const el = document.createElement('div');
  el.style.width = '34px';
  el.style.height = '34px';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.innerHTML = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#10B981" stroke="white" stroke-width="2"/><path d="M12 6L16 16L12 14L8 16L12 6Z" fill="white"/></svg>`;
  return el;
}
function createStoreEl(): HTMLElement {
  const el = document.createElement('div');
  el.style.width = '28px';
  el.style.height = '28px';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#F59E0B" stroke="white" stroke-width="2"/><path d="M8 8h8l1 4H7l1-4z" fill="white"/><rect x="7" y="12" width="10" height="3" rx="1" fill="white"/></svg>`;
  return el;
}
function createDeliveryEl(): HTMLElement {
  const el = document.createElement('div');
  el.style.width = '30px';
  el.style.height = '30px';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.innerHTML = `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#3B82F6" stroke="white" stroke-width="2"/><path d="M12 6C9.24 6 7 8.24 7 11c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 6.75c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" fill="white"/></svg>`;
  return el;
}

interface MarkerData {
  latitude: number;
  longitude: number;
  type: 'store' | 'delivery' | 'rider';
  label?: string;
}
interface CustomerTrackingMapProps { markers: MarkerData[]; }

function popupText(value: string) {
  const node = document.createElement('div');
  node.className = 'p-1 text-sm font-bold';
  node.textContent = value;
  return node;
}

export default function CustomerTrackingMap({ markers }: CustomerTrackingMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const validMarkers = markers.filter((marker) => Number.isFinite(marker.latitude) && Number.isFinite(marker.longitude));

  useEffect(() => {
    const container = containerRef.current;
    if (!container || validMarkers.length === 0) return;
    const token = getMapboxToken();
    if (!token) {
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-size:14px;">Map unavailable – missing Mapbox token</div>';
      return;
    }
    mapboxgl.accessToken = token;

    const riderMarker = validMarkers.find((marker) => marker.type === 'rider');
    const deliveryMarker = validMarkers.find((marker) => marker.type === 'delivery');
    const focusMarkers = riderMarker && deliveryMarker ? [riderMarker, deliveryMarker] : riderMarker ? [riderMarker] : validMarkers;
    const focusPoints: [number, number][] = focusMarkers.map((marker) => [marker.longitude, marker.latitude]);
    const center: [number, number] = riderMarker ? [riderMarker.longitude, riderMarker.latitude] : focusPoints[0];

    const map = new mapboxgl.Map({
      container,
      style: 'mapbox://styles/mapbox/streets-v12',
      center,
      zoom: 16,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      const routePoints = [riderMarker, deliveryMarker]
        .filter((marker): marker is MarkerData => Boolean(marker))
        .map((marker) => [marker!.longitude, marker!.latitude] as [number, number]);
      if (routePoints.length === 2) {
        map.addSource('route', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: routePoints } },
        });
        map.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          paint: { 'line-color': '#3B82F6', 'line-width': 3, 'line-opacity': 0.7, 'line-dasharray': [1, 2] },
        });
      }

      const elMap: Record<MarkerData['type'], () => HTMLElement> = {
        store: createStoreEl,
        delivery: createDeliveryEl,
        rider: createRiderEl,
      };
      validMarkers.forEach((marker) => {
        const el = elMap[marker.type]();
        const popup = new mapboxgl.Popup({ offset: 18 }).setDOMContent(popupText(marker.label || marker.type));
        new mapboxgl.Marker({ element: el }).setLngLat([marker.longitude, marker.latitude]).setPopup(popup).addTo(map);
      });
    });

    if (focusPoints.length === 1) {
      map.setCenter(focusPoints[0]);
      map.setZoom(16);
    } else {
      const bounds = new mapboxgl.LngLatBounds();
      focusPoints.forEach((p) => bounds.extend(p));
      map.on('load', () => {
        try { map.fitBounds(bounds, { padding: 26, maxZoom: 16, duration: 0 }); } catch {}
      });
      if (map.isStyleLoaded()) {
        try { map.fitBounds(bounds, { padding: 26, maxZoom: 16, duration: 0 }); } catch {}
      }
    }

    return () => {
      map.remove();
    };
  }, [validMarkers]);

  if (validMarkers.length === 0) {
    return <div className="flex h-[240px] items-center justify-center rounded-2xl bg-slate-100 text-sm font-medium text-slate-400 sm:h-[280px]">No location data available</div>;
  }

  return (
    <div className="h-[240px] w-full overflow-hidden rounded-2xl sm:h-[280px]">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
