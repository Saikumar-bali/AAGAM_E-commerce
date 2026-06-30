'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

const RiderIcon = L.divIcon({
  className: 'custom-rider-icon',
  html: `<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" fill="#10B981" stroke="white" stroke-width="2"/>
            <path d="M12 6L16 16L12 14L8 16L12 6Z" fill="white"/>
          </svg>
        </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const StoreIcon = L.divIcon({
  className: 'custom-store-icon',
  html: `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" fill="#F59E0B" stroke="white" stroke-width="2"/>
            <path d="M8 8h8l1 4H7l1-4z" fill="white"/>
            <rect x="7" y="12" width="10" height="3" rx="1" fill="white"/>
          </svg>
        </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const DeliveryIcon = L.divIcon({
  className: 'custom-delivery-icon',
  html: `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" fill="#3B82F6" stroke="white" stroke-width="2"/>
            <path d="M12 6C9.24 6 7 8.24 7 11c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 6.75c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" fill="white"/>
          </svg>
        </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

interface MapUpdaterProps {
  center: [number, number];
  bounds?: [[number, number], [number, number]];
}

function MapUpdater({ center, bounds }: MapUpdaterProps) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    } else {
      map.setView(center, 15);
    }
  }, [center, bounds, map]);
  return null;
}

interface MarkerData {
  latitude: number;
  longitude: number;
  type: 'store' | 'delivery' | 'rider';
  label?: string;
}

interface CustomerTrackingMapProps {
  markers: MarkerData[];
}

export default function CustomerTrackingMap({ markers }: CustomerTrackingMapProps) {
  const validMarkers = markers.filter(m => typeof m.latitude === 'number' && typeof m.longitude === 'number');

  if (validMarkers.length === 0) {
    return (
      <div className="h-[300px] bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 text-sm font-medium">
        No location data available
      </div>
    );
  }

  const allPoints: [number, number][] = validMarkers.map(m => [m.latitude, m.longitude]);
  const bounds: [[number, number], [number, number]] = [
    [Math.min(...allPoints.map(p => p[0])), Math.min(...allPoints.map(p => p[1]))],
    [Math.max(...allPoints.map(p => p[0])), Math.max(...allPoints.map(p => p[1]))],
  ];

  const riderMarker = validMarkers.find(m => m.type === 'rider');
  const center: [number, number] = riderMarker
    ? [riderMarker.latitude, riderMarker.longitude]
    : [validMarkers[0].latitude, validMarkers[0].longitude];

  const iconMap: Record<string, L.DivIcon> = {
    store: StoreIcon,
    delivery: DeliveryIcon,
    rider: RiderIcon,
  };

  return (
    <div className="h-[300px] w-full rounded-2xl overflow-hidden">
      <MapContainer
        {...({ center, zoom: 15, zoomControl: false } as any)}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          {...({
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          } as any)}
        />
        <MapUpdater center={center} bounds={bounds} />
        {validMarkers.map((m, idx) => (
          <Marker
            key={`${m.type}-${idx}`}
            position={[m.latitude, m.longitude]}
            {...({ icon: iconMap[m.type] } as any)}
          >
            <Popup>
              <div className="p-1 text-sm font-bold">{m.label || m.type}</div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
