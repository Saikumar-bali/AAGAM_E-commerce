'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L, { type Marker as LeafletMarker } from 'leaflet';
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

function Recenter({ latitude, longitude }: Pick<Props, 'latitude' | 'longitude'>) {
  const map = useMap();
  useEffect(() => {
    map.setView([latitude, longitude], Math.max(map.getZoom(), 17), { animate: true });
  }, [latitude, longitude, map]);
  return null;
}

function MapClick({ onChange }: Pick<Props, 'onChange'>) {
  useMapEvents({
    click(event) {
      onChange(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

export default function CustomerLocationPicker({ latitude, longitude, onChange }: Props) {
  const markerRef = useRef<LeafletMarker | null>(null);
  const handlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (!marker) return;
        const position = marker.getLatLng();
        onChange(position.lat, position.lng);
      },
    }),
    [onChange],
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-teal-200 bg-white">
      <div className="h-64 w-full">
        <MapContainer
          center={[latitude, longitude]}
          zoom={17}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Recenter latitude={latitude} longitude={longitude} />
          <MapClick onChange={onChange} />
          <Marker
            draggable
            eventHandlers={handlers}
            position={[latitude, longitude]}
            icon={pinIcon}
            ref={markerRef}
          />
        </MapContainer>
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
