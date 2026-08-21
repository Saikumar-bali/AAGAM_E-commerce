"use client";

import React, { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker, Circle } from "leaflet";

import "leaflet/dist/leaflet.css";

type Props = {
  latitude: number;
  longitude: number;
  radius: number;
  onCenterChange: (lat: number, lng: number) => void;
  onRadiusChange: (km: number) => void;
};

const ANDHRA_PRADESH_CENTER: [number, number] = [17.6868, 83.2185];

export default function LocalityMapPicker({
  latitude,
  longitude,
  radius,
  onCenterChange,
  onRadiusChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const circleRef = useRef<Circle | null>(null);
  const centerCbRef = useRef(onCenterChange);
  const radiusCbRef = useRef(onRadiusChange);

  useEffect(() => { centerCbRef.current = onCenterChange; }, [onCenterChange]);
  useEffect(() => { radiusCbRef.current = onRadiusChange; }, [onRadiusChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;

    (async () => {
      const L = await import("leaflet");

      if (cancelled || !containerRef.current) return;

      const center: [number, number] =
        latitude && longitude ? [latitude, longitude] : ANDHRA_PRADESH_CENTER;
      const zoom = latitude && longitude ? 13 : 7;

      const map = L.map(containerRef.current, {
        center,
        zoom,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker(center, { draggable: true }).addTo(map);
      const circle = L.circle(center, {
        radius: radius * 1000,
        color: "#0d9488",
        fillColor: "#0d9488",
        fillOpacity: 0.12,
        weight: 2,
      }).addTo(map);

      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        marker.setLatLng(e.latlng);
        circle.setLatLng(e.latlng);
        centerCbRef.current(
          Math.round(e.latlng.lat * 1e7) / 1e7,
          Math.round(e.latlng.lng * 1e7) / 1e7,
        );
      });

      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        circle.setLatLng(pos);
        centerCbRef.current(
          Math.round(pos.lat * 1e7) / 1e7,
          Math.round(pos.lng * 1e7) / 1e7,
        );
      });

      mapRef.current = map;
      markerRef.current = marker;
      circleRef.current = circle;
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!markerRef.current || !circleRef.current) return;
    if (latitude && longitude) {
      const pos: [number, number] = [latitude, longitude];
      markerRef.current.setLatLng(pos);
      circleRef.current.setLatLng(pos);
      mapRef.current?.setView(pos, Math.max(mapRef.current.getZoom(), 12));
    }
    circleRef.current.setRadius(radius * 1000);
  }, [latitude, longitude, radius]);

  return (
    <div
      ref={containerRef}
      style={{ height: 300, width: "100%", borderRadius: 16, zIndex: 0 }}
      className="overflow-hidden border border-slate-200"
    />
  );
}
