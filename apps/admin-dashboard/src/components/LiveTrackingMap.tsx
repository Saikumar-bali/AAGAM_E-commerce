'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with Next.js
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom Rider Icon
const RiderIcon = (bearing: number = 0) => L.divIcon({
  className: 'custom-rider-icon',
  html: `<div style="transform: rotate(${bearing}deg); transition: transform 0.3s ease;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" fill="#10B981" stroke="white" stroke-width="2"/>
            <path d="M12 6L16 16L12 14L8 16L12 6Z" fill="white"/>
          </svg>
        </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

interface MapUpdaterProps {
  center: [number, number];
}

function MapUpdater({ center }: MapUpdaterProps) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

interface LiveTrackingMapProps {
  riders: Array<{
    id: string;
    latitude: number | null;
    longitude: number | null;
    bearing?: number;
    user?: { name: string | null };
    status: string;
  }>;
  selectedRiderId?: string | null;
}

export default function LiveTrackingMap({ riders, selectedRiderId }: LiveTrackingMapProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>([20.5937, 78.9629]); // Default to India center

  useEffect(() => {
    if (selectedRiderId) {
      const rider = riders.find(r => r.id === selectedRiderId);
      if (rider && rider.latitude && rider.longitude) {
        setMapCenter([rider.latitude, rider.longitude]);
      }
    }
  }, [selectedRiderId, riders]);

  return (
    <div className="h-full w-full rounded-2xl overflow-hidden shadow-inner border border-gray-100">
      <MapContainer 
        {...({ center: mapCenter, zoom: 13 } as any)}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          {...({
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          } as any)}
        />
        <MapUpdater center={mapCenter} />
        
        {riders.map(rider => (
          rider.latitude && rider.longitude && (
            <Marker 
              key={rider.id} 
              position={[rider.latitude, rider.longitude]}
              {...({ icon: RiderIcon(rider.bearing || 0) } as any)}
            >
              <Popup>
                <div className="p-1">
                  <p className="font-bold text-gray-900">{rider.user?.name || 'Rider'}</p>
                  <p className="text-xs text-gray-500 mt-1">Status: <span className="font-semibold text-emerald-600">{rider.status}</span></p>
                </div>
              </Popup>
            </Marker>
          )
        ))}
      </MapContainer>
    </div>
  );
}
