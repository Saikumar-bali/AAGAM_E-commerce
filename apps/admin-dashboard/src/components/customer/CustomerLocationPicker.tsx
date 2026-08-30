'use client';

import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getMapboxToken } from '@/lib/mapbox';

function createPinElement(): HTMLElement {
  const el = document.createElement('div');
  el.style.width = '36px';
  el.style.height = '36px';
  el.style.cursor = 'grab';
  el.innerHTML = '<div style="width:36px;height:36px;border-radius:18px 18px 18px 4px;transform:rotate(-45deg);background:#0f766e;border:4px solid white;box-shadow:0 8px 24px rgba(15,23,42,.25);display:flex;align-items:center;justify-content:center"><div style="width:10px;height:10px;border-radius:50%;background:white;margin:9px;transform:rotate(45deg)"></div></div>';
  return el;
}

type Props = {
  latitude: number;
  longitude: number;
  onChange: (latitude: number, longitude: number) => void;
};

export default function CustomerLocationPicker({ latitude, longitude, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const token = getMapboxToken();
    if (!token) {
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-size:14px;">Map unavailable – missing Mapbox token</div>';
      return;
    }
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [longitude, latitude],
      zoom: 17,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    const el = createPinElement();
    const marker = new mapboxgl.Marker({ element: el, draggable: true }).setLngLat([longitude, latitude]).addTo(map);
    markerRef.current = marker;

    const handleClick = (e: mapboxgl.MapMouseEvent) => {
      onChangeRef.current(e.lngLat.lat, e.lngLat.lng);
    };
    const handleDragEnd = () => {
      const lngLat = marker.getLngLat();
      onChangeRef.current(lngLat.lat, lngLat.lng);
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

    marker.setLngLat([longitude, latitude]);
    map.setCenter([longitude, latitude]);
    if (map.getZoom() < 17) map.setZoom(17);
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
