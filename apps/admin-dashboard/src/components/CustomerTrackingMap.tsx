'use client';

import React, { useEffect } from 'react';
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
  html: `<div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#10B981" stroke="white" stroke-width="2"/><path d="M12 6L16 16L12 14L8 16L12 6Z" fill="white"/></svg></div>`,
  iconSize: [34, 34], iconAnchor: [17, 17],
});
const StoreIcon = L.divIcon({
  className: 'custom-store-icon',
  html: `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#F59E0B" stroke="white" stroke-width="2"/><path d="M8 8h8l1 4H7l1-4z" fill="white"/><rect x="7" y="12" width="10" height="3" rx="1" fill="white"/></svg></div>`,
  iconSize: [28, 28], iconAnchor: [14, 14],
});
const DeliveryIcon = L.divIcon({
  className: 'custom-delivery-icon',
  html: `<div style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#3B82F6" stroke="white" stroke-width="2"/><path d="M12 6C9.24 6 7 8.24 7 11c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 6.75c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" fill="white"/></svg></div>`,
  iconSize: [30, 30], iconAnchor: [15, 15],
});

interface MapUpdaterProps {
  center: [number, number];
  bounds?: [[number, number], [number, number]];
  singlePoint: boolean;
}

function MapUpdater({ center, bounds, singlePoint }: MapUpdaterProps) {
  const map = useMap();
  useEffect(() => {
    if (bounds && !singlePoint) map.fitBounds(bounds, { padding: [26, 26], maxZoom: 16, animate: true });
    else map.setView(center, 16, { animate: true });
  }, [center, bounds, singlePoint, map]);
  return null;
}

interface MarkerData {
  latitude: number;
  longitude: number;
  type: 'store' | 'delivery' | 'rider';
  label?: string;
}
interface CustomerTrackingMapProps { markers: MarkerData[]; }

export default function CustomerTrackingMap({ markers }: CustomerTrackingMapProps) {
  const validMarkers = markers.filter((marker) => Number.isFinite(marker.latitude) && Number.isFinite(marker.longitude));
  if (validMarkers.length === 0) return <div className="flex h-[240px] items-center justify-center rounded-2xl bg-slate-100 text-sm font-medium text-slate-400 sm:h-[280px]">No location data available</div>;

  const riderMarker = validMarkers.find((marker) => marker.type === 'rider');
  const deliveryMarker = validMarkers.find((marker) => marker.type === 'delivery');
  const focusMarkers = riderMarker && deliveryMarker ? [riderMarker, deliveryMarker] : riderMarker ? [riderMarker] : validMarkers;
  const focusPoints: [number, number][] = focusMarkers.map((marker) => [marker.latitude, marker.longitude]);
  const center: [number, number] = riderMarker ? [riderMarker.latitude, riderMarker.longitude] : focusPoints[0];
  const bounds: [[number, number], [number, number]] = [
    [Math.min(...focusPoints.map((point) => point[0])), Math.min(...focusPoints.map((point) => point[1]))],
    [Math.max(...focusPoints.map((point) => point[0])), Math.max(...focusPoints.map((point) => point[1]))],
  ];
  const routePoints = [riderMarker, deliveryMarker].filter(Boolean).map((marker) => [marker!.latitude, marker!.longitude] as [number, number]);
  const iconMap: Record<MarkerData['type'], L.DivIcon> = { store: StoreIcon, delivery: DeliveryIcon, rider: RiderIcon };

  return (
    <div className="h-[240px] w-full overflow-hidden rounded-2xl sm:h-[280px]">
      <MapContainer {...({ center, zoom: 16, minZoom: 14, maxZoom: 18, zoomControl: false } as any)} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer {...({ attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' } as any)} />
        <MapUpdater center={center} bounds={bounds} singlePoint={focusPoints.length === 1} />
        {routePoints.length === 2 ? <Polyline positions={routePoints} pathOptions={{ dashArray: '7 8', weight: 3, opacity: 0.7 }} /> : null}
        {validMarkers.map((marker, index) => <Marker key={`${marker.type}-${index}`} position={[marker.latitude, marker.longitude]} {...({ icon: iconMap[marker.type] } as any)}><Popup><div className="p-1 text-sm font-bold">{marker.label || marker.type}</div></Popup></Marker>)}
      </MapContainer>
    </div>
  );
}
