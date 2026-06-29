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
      map.setView(center);
    }
  }, [center, bounds, map]);
  return null;
}

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
  onOrderClick?: (orderId: string) => void;
  showRoutePath?: { latitude: number; longitude: number }[];
}

export default function LiveTrackingMap({ riders = [], orders = [], selectedOrderId, onOrderClick, showRoutePath }: LiveTrackingMapProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>([20.5937, 78.9629]);

  const allPoints: [number, number][] = [];

  riders.forEach(r => {
    if (r.latitude && r.longitude) allPoints.push([r.latitude, r.longitude]);
  });

  orders.forEach(o => {
    if (o.store.latitude && o.store.longitude) allPoints.push([o.store.latitude, o.store.longitude]);
    if (o.delivery.latitude && o.delivery.longitude) allPoints.push([o.delivery.latitude, o.delivery.longitude]);
    if (o.rider?.latitude && o.rider?.longitude) allPoints.push([o.rider.latitude, o.rider.longitude]);
    if (o.latestLocation) allPoints.push([o.latestLocation.latitude, o.latestLocation.longitude]);
  });

  const bounds: [[number, number], [number, number]] | undefined = allPoints.length > 1
    ? [
        [Math.min(...allPoints.map(p => p[0])), Math.min(...allPoints.map(p => p[1]))],
        [Math.max(...allPoints.map(p => p[0])), Math.max(...allPoints.map(p => p[1]))],
      ]
    : undefined;

  useEffect(() => {
    if (selectedOrderId) {
      const order = orders.find(o => o.orderId === selectedOrderId);
      if (order) {
        const lat = order.rider?.latitude ?? order.latestLocation?.latitude ?? order.store.latitude;
        const lng = order.rider?.longitude ?? order.latestLocation?.longitude ?? order.store.longitude;
        if (lat && lng) setMapCenter([lat, lng]);
      }
    }
  }, [selectedOrderId, orders]);

  const routePathCoords: [number, number][] = showRoutePath
    ? showRoutePath.map(p => [p.latitude, p.longitude])
    : [];

  return (
    <div className="h-full w-full rounded-2xl overflow-hidden shadow-inner border border-gray-100">
      <MapContainer
        {...({ center: mapCenter, zoom: 13 } as any)}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          {...({
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          } as any)}
        />
        <MapUpdater center={mapCenter} bounds={bounds} />

        {routePathCoords.length > 1 && (
          <Polyline positions={routePathCoords} color="#3B82F6" weight={3} opacity={0.7} />
        )}

        {riders.map(rider => (
          rider.latitude && rider.longitude && (
            <Marker
              key={`rider-${rider.id}`}
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

        {orders.map(order => (
          <React.Fragment key={`order-${order.orderId}`}>
            {order.store.latitude && order.store.longitude && (
              <Marker
                position={[order.store.latitude, order.store.longitude]}
                {...({ icon: StoreIcon } as any)}
              >
                <Popup>
                  <div className="p-1">
                    <p className="font-bold text-gray-900">{order.store.name}</p>
                    <p className="text-xs text-gray-500">Store</p>
                  </div>
                </Popup>
              </Marker>
            )}

            {order.delivery.latitude && order.delivery.longitude && (
              <Marker
                position={[order.delivery.latitude, order.delivery.longitude]}
                {...({ icon: DeliveryIcon } as any)}
                eventHandlers={{ click: () => onOrderClick?.(order.orderId) }}
              >
                <Popup>
                  <div className="p-1">
                    <p className="font-bold text-gray-900">Delivery</p>
                    <p className="text-xs text-gray-500">{order.customer.name || 'Customer'}</p>
                    <p className="text-xs text-gray-400 font-mono">#{order.orderId.slice(-8).toUpperCase()}</p>
                  </div>
                </Popup>
              </Marker>
            )}
          </React.Fragment>
        ))}
      </MapContainer>
    </div>
  );
}
