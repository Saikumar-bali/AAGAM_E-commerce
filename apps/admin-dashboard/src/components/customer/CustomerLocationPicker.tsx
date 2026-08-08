'use client';

import React, { useEffect, useRef } from 'react';
import L, { type Map as LeafletMap, type Marker as LeafletMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';

const pinIcon = L.divIcon({
  className: 'aagam-address-pin',
  html: '<div style="width:36px;height:36px;border-radius:18px 18px 18px 4px;transform:rotate(-45deg);background:#0f766e;border:4px solid white;box-shadow:0 8px 24px rgba(15,23,42,.25)"><div style="width:10px;height:10px;border-radius:50%;background:white;margin:9px"></div></div>',
  iconSize: [36, 36],
  iconAnchor: [18, 34],
});

type Props = {
  latitude: number;
  longitude: number;
  onChange: (latitude: number, longitude: number) => void;
};

export default function CustomerLocationPicker({ latitude, longitude, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container, { scrollWheelZoom: true }).setView([latitude, longitude], 17);
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([latitude, longitude], {
      draggable: true,
      icon: pinIcon,
    }).addTo(map);
    markerRef.current = marker;

    const handleClick = (event: L.LeafletMouseEvent) => {
      onChangeRef.current(event.latlng.lat, event.latlng.lng);
    };
    const handleDragEnd = () => {
      const position = marker.getLatLng();
      onChangeRef.current(position.lat, position.lng);
    };

    map.on('click', handleClick);
    marker.on('dragend', handleDragEnd);

    return () => {
      marker.off('dragend', handleDragEnd);
      map.off('click', handleClick);
      map.remove();
      markerRef.current = null;
      mapRef.current = null;
    };
    // The map object is intentionally created once for this mounted picker.
    // Prop coordinate changes are handled by the synchronization effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    const nextPosition = L.latLng(latitude, longitude);
    marker.setLatLng(nextPosition);
    map.setView(nextPosition, Math.max(map.getZoom(), 17), { animate: true });
  }, [latitude, longitude]);

  return (
    <div className="overflow-hidden rounded-2xl border border-teal-200 bg-white">
      <div className="h-64 w-full">
        <div ref={containerRef} className="h-full w-full" />
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs font-bold text-slate-600">
        <span>Drag the pin or tap the map to set the entrance.</span>
        <span className="font-mono text-[10px] text-slate-400">
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </span>
      </div>
    </div>
  );
}
