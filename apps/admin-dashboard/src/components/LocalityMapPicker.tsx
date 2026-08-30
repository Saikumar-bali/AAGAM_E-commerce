"use client";

import React, { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

type Props = {
  latitude: number;
  longitude: number;
  radius: number;
  onCenterChange: (lat: number, lng: number) => void;
  onRadiusChange: (km: number) => void;
};

const ANDHRA_PRADESH_CENTER: [number, number] = [83.2185, 17.6868];
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || 'pk.eyJ1Ijoic2Fpa3VtY3VtdYXiYIwiYSI6ImNtdD1ON3F5ZzBmYjgd3NodWE1a2hzZG4ifQ.4puZMTpkr6k1P9BPQreYdw';
if (typeof window !== 'undefined' && MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

const TEAL_MARKER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
  <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="#0d9488" stroke="#fff" stroke-width="2"/>
  <circle cx="14" cy="13" r="5" fill="#fff"/>
</svg>`;

function createTealElement(): HTMLElement {
  const el = document.createElement('div');
  el.style.width = '28px';
  el.style.height = '40px';
  el.style.cursor = 'grab';
  el.innerHTML = TEAL_MARKER_SVG;
  return el;
}

function createCircleGeoJSON(center: [number, number], radiusKm: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const points = 64;
  const coords: [number, number][] = [];
  const distanceX = radiusKm / 111.32; // approx degrees latitude
  const distanceY = radiusKm / (111.32 * Math.cos((center[1] * Math.PI) / 180));
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    coords.push([center[0] + x, center[1] + y]);
  }
  coords.push(coords[0]);
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

export default function LocalityMapPicker({
  latitude,
  longitude,
  radius,
  onCenterChange,
  onRadiusChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const centerCbRef = useRef(onCenterChange);
  const radiusCbRef = useRef(onRadiusChange);

  useEffect(() => { centerCbRef.current = onCenterChange; }, [onCenterChange]);
  useEffect(() => { radiusCbRef.current = onRadiusChange; }, [onRadiusChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: [number, number] =
      latitude && longitude ? [longitude, latitude] : ANDHRA_PRADESH_CENTER;
    const zoom = latitude && longitude ? 14 : 7;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center,
      zoom,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    const el = createTealElement();
    const marker = new mapboxgl.Marker({ element: el, draggable: true }).setLngLat(center).addTo(map);

    map.on('load', () => {
      const circleData = createCircleGeoJSON(center, radius);
      map.addSource('radius', { type: 'geojson', data: circleData as any });
      map.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#0d9488', 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': '#0d9488', 'line-width': 2 } });

      map.on('click', (e) => {
        const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        marker.setLngLat(lngLat);
        const newData = createCircleGeoJSON(lngLat, radius);
        (map.getSource('radius') as mapboxgl.GeoJSONSource)?.setData(newData as any);
        centerCbRef.current(
          Math.round(e.lngLat.lat * 1e7) / 1e7,
          Math.round(e.lngLat.lng * 1e7) / 1e7,
        );
      });

      marker.on('dragend', () => {
        const lngLat = marker.getLngLat();
        const newCenter: [number, number] = [lngLat.lng, lngLat.lat];
        const newData = createCircleGeoJSON(newCenter, radius);
        (map.getSource('radius') as mapboxgl.GeoJSONSource)?.setData(newData as any);
        centerCbRef.current(
          Math.round(lngLat.lat * 1e7) / 1e7,
          Math.round(lngLat.lng * 1e7) / 1e7,
        );
      });
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    if (latitude && longitude) {
      const pos: [number, number] = [longitude, latitude];
      marker.setLngLat(pos);
      const source = map.getSource('radius') as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        const newData = createCircleGeoJSON(pos, radius);
        source.setData(newData as any);
      }
      map.setCenter(pos);
      if (map.getZoom() < 14) map.setZoom(14);
    } else {
      const source = map.getSource('radius') as mapboxgl.GeoJSONSource | undefined;
      if (source && latitude && longitude) {
        const pos: [number, number] = [longitude, latitude];
        const newData = createCircleGeoJSON(pos, radius);
        source.setData(newData as any);
      }
    }
    const source = map.getSource('radius') as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      const current = marker.getLngLat();
      const newData = createCircleGeoJSON([current.lng, current.lat], radius);
      source.setData(newData as any);
    }
  }, [latitude, longitude, radius]);

  return (
    <div
      ref={containerRef}
      style={{ height: 300, width: "100%", borderRadius: 16, zIndex: 0 }}
      className="overflow-hidden border border-slate-200"
    />
  );
}
