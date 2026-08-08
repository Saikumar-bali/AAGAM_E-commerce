'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

interface ActiveOrder {
  orderId: string;
  status: string;
  store: { id: string; name: string; latitude: number | null; longitude: number | null };
  customer: { id: string; name: string | null; phone: string | null };
  rider: { id: string; name: string | null; phone: string | null; latitude: number | null; longitude: number | null; updatedAt: string } | null;
  latestLocation: { latitude: number; longitude: number; createdAt: string } | null;
  delivery: { latitude: number | null; longitude: number | null };
}

interface LiveTrackingMapProps {
  riders?: Array<{
    id: string;
    latitude: number | null;
    longitude: number | null;
    bearing?: number;
    user?: { name: string | null };
    status: string;
  }>;
  orders?: ActiveOrder[];
  selectedOrderId?: string | null;
  selectedRiderId?: string | null;
  onOrderClick?: (orderId: string) => void;
  showRoutePath?: { latitude: number; longitude: number }[];
}

const hasCoordinate = (value: number | null | undefined): value is number =>
  value !== null && value !== undefined && Number.isFinite(value);

function popupContent(title: string, lines: Array<{ label?: string; value: string }>) {
  const root = document.createElement('div');
  root.className = 'p-1';

  const heading = document.createElement('p');
  heading.className = 'font-bold text-gray-900';
  heading.textContent = title;
  root.appendChild(heading);

  for (const line of lines) {
    const paragraph = document.createElement('p');
    paragraph.className = 'text-xs text-gray-500 mt-1';
    paragraph.textContent = line.label ? `${line.label}: ${line.value}` : line.value;
    root.appendChild(paragraph);
  }

  return root;
}

export default function LiveTrackingMap({
  riders = [],
  orders = [],
  selectedOrderId,
  selectedRiderId,
  onOrderClick,
  showRoutePath,
}: LiveTrackingMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const allPoints: [number, number][] = [];
    riders.forEach((rider) => {
      if (hasCoordinate(rider.latitude) && hasCoordinate(rider.longitude)) {
        allPoints.push([rider.latitude, rider.longitude]);
      }
    });
    orders.forEach((order) => {
      if (hasCoordinate(order.store.latitude) && hasCoordinate(order.store.longitude)) {
        allPoints.push([order.store.latitude, order.store.longitude]);
      }
      if (hasCoordinate(order.delivery.latitude) && hasCoordinate(order.delivery.longitude)) {
        allPoints.push([order.delivery.latitude, order.delivery.longitude]);
      }
      if (hasCoordinate(order.rider?.latitude) && hasCoordinate(order.rider?.longitude)) {
        allPoints.push([order.rider.latitude, order.rider.longitude]);
      }
      if (order.latestLocation && hasCoordinate(order.latestLocation.latitude) && hasCoordinate(order.latestLocation.longitude)) {
        allPoints.push([order.latestLocation.latitude, order.latestLocation.longitude]);
      }
    });

    const selectedRider = selectedRiderId ? riders.find((rider) => rider.id === selectedRiderId) : undefined;
    const selectedRiderPoint: [number, number] | null =
      hasCoordinate(selectedRider?.latitude) && hasCoordinate(selectedRider?.longitude)
        ? [selectedRider.latitude, selectedRider.longitude]
        : null;

    let mapCenter: [number, number] = [20.5937, 78.9629];
    if (selectedRiderPoint) {
      mapCenter = selectedRiderPoint;
    } else if (selectedOrderId) {
      const order = orders.find((candidate) => candidate.orderId === selectedOrderId);
      const lat = order?.rider?.latitude ?? order?.latestLocation?.latitude ?? order?.store.latitude;
      const lng = order?.rider?.longitude ?? order?.latestLocation?.longitude ?? order?.store.longitude;
      if (hasCoordinate(lat) && hasCoordinate(lng)) mapCenter = [lat, lng];
    } else if (allPoints[0]) {
      mapCenter = allPoints[0];
    }

    const map = L.map(container, { scrollWheelZoom: true, zoomControl: true }).setView(mapCenter, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const routePathCoords: [number, number][] = (showRoutePath || [])
      .filter((point) => hasCoordinate(point.latitude) && hasCoordinate(point.longitude))
      .map((point) => [point.latitude, point.longitude]);
    if (routePathCoords.length > 1) {
      L.polyline(routePathCoords, { color: '#3B82F6', weight: 3, opacity: 0.7 }).addTo(map);
    }

    riders.forEach((rider) => {
      if (!hasCoordinate(rider.latitude) || !hasCoordinate(rider.longitude)) return;
      L.marker([rider.latitude, rider.longitude], { icon: RiderIcon(rider.bearing || 0) })
        .bindPopup(popupContent(rider.user?.name || 'Rider', [{ label: 'Status', value: rider.status }]))
        .addTo(map);
    });

    orders.forEach((order) => {
      if (hasCoordinate(order.store.latitude) && hasCoordinate(order.store.longitude)) {
        L.marker([order.store.latitude, order.store.longitude], { icon: StoreIcon })
          .bindPopup(popupContent(order.store.name || 'Store', [{ value: 'Store' }]))
          .addTo(map);
      }

      if (hasCoordinate(order.delivery.latitude) && hasCoordinate(order.delivery.longitude)) {
        const marker = L.marker([order.delivery.latitude, order.delivery.longitude], { icon: DeliveryIcon })
          .bindPopup(
            popupContent('Delivery', [
              { value: order.customer.name || 'Customer' },
              { value: `#${order.orderId.slice(-8).toUpperCase()}` },
            ]),
          )
          .addTo(map);
        marker.on('click', () => onOrderClick?.(order.orderId));
      }
    });

    const mapPoints = selectedRiderPoint ? [selectedRiderPoint] : allPoints;
    if (mapPoints.length === 1) {
      map.setView(mapPoints[0], 16, { animate: false });
    } else if (mapPoints.length > 1) {
      map.fitBounds(L.latLngBounds(mapPoints), { padding: [64, 64], maxZoom: 16, animate: false });
    }

    return () => {
      map.remove();
    };
  }, [riders, orders, selectedOrderId, selectedRiderId, onOrderClick, showRoutePath]);

  return (
    <div className="h-full w-full overflow-hidden rounded-2xl border border-gray-100 shadow-inner">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
