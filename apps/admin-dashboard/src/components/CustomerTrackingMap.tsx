'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

    const riderMarker = validMarkers.find((marker) => marker.type === 'rider');
    const deliveryMarker = validMarkers.find((marker) => marker.type === 'delivery');
    const focusMarkers = riderMarker && deliveryMarker ? [riderMarker, deliveryMarker] : riderMarker ? [riderMarker] : validMarkers;
    const focusPoints: [number, number][] = focusMarkers.map((marker) => [marker.latitude, marker.longitude]);
    const center: [number, number] = riderMarker ? [riderMarker.latitude, riderMarker.longitude] : focusPoints[0];

    const map = L.map(container, {
      zoomControl: false,
      scrollWheelZoom: false,
      minZoom: 8,
      maxZoom: 18,
    }).setView(center, 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const routePoints = [riderMarker, deliveryMarker]
      .filter((marker): marker is MarkerData => Boolean(marker))
      .map((marker) => [marker.latitude, marker.longitude] as [number, number]);
    if (routePoints.length === 2) {
      L.polyline(routePoints, { dashArray: '7 8', weight: 3, opacity: 0.7 }).addTo(map);
    }

    const iconMap: Record<MarkerData['type'], L.DivIcon> = {
      store: StoreIcon,
      delivery: DeliveryIcon,
      rider: RiderIcon,
    };
    validMarkers.forEach((marker) => {
      L.marker([marker.latitude, marker.longitude], { icon: iconMap[marker.type] })
        .bindPopup(popupText(marker.label || marker.type))
        .addTo(map);
    });

    if (focusPoints.length === 1) {
      map.setView(focusPoints[0], 16, { animate: false });
    } else {
      map.fitBounds(L.latLngBounds(focusPoints), { padding: [26, 26], maxZoom: 16, animate: false });
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
