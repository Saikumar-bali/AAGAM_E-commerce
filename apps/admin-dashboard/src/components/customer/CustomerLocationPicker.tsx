'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getMapboxToken } from '@/lib/mapbox';
import { apiClient } from '@aagam/utils';
import { MapPin, Search, X } from 'lucide-react';

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
  fullHeight?: boolean;
};

type SearchResult = {
  displayName: string;
  lat: number;
  lng: number;
  type: string;
  placeId?: string;
};

export default function CustomerLocationPicker({ latitude, longitude, onChange, fullHeight }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const flyTo = useCallback((lat: number, lng: number) => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    map.flyTo({ center: [lng, lat], zoom: 16 });
    marker.setLngLat([lng, lat]);
    onChangeRef.current(lat, lng);
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    if (query.trim().length < 3) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      // Google Places via the API gateway proxy (server-side key, no browser CORS limits)
      try {
        const { data } = await apiClient.get('/geo/places/autocomplete', {
          params: { q: query.trim(), lat: latitude, lng: longitude },
        });
        if (data?.ok && Array.isArray(data.results) && data.results.length > 0) {
          setSearchResults(data.results);
          return;
        }
      } catch {
        // proxy unavailable (or Places not enabled) — fall back to Mapbox below
      }
      const token = getMapboxToken();
      if (!token) { setSearchResults([]); return; }
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&country=in&types=address,place,neighborhood,poi&autocomplete=true&limit=5&proximity=${longitude},${latitude}`
      );
      const data = await res.json();
      const features = (data.features || []).map((f: any) => ({
        displayName: f.place_name || f.text || '',
        lat: f.center?.[1] ?? 0,
        lng: f.center?.[0] ?? 0,
        type: f.place_type?.[0] || 'place',
      }));
      setSearchResults(features);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [latitude, longitude]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleSearch(value), 300);
  };

  const handleSelectResult = async (result: SearchResult) => {
    setSearchQuery(result.displayName);
    setSearchResults([]);
    if (result.placeId && (!result.lat || !result.lng)) {
      try {
        const { data } = await apiClient.get('/geo/places/details', { params: { placeId: result.placeId } });
        if (data?.ok && Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
          flyTo(data.lat, data.lng);
        }
      } catch {
        // could not resolve coordinates — leave the pin where it is
      }
      return;
    }
    flyTo(result.lat, result.lng);
  };

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
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
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
    <div className={fullHeight ? 'flex h-full flex-col overflow-hidden bg-white' : 'overflow-hidden rounded-2xl border border-teal-200 bg-white'}>
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search address..."
            className="w-full border-b border-slate-100 bg-white px-10 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
          {searching && <div className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-slate-400">...</div>}
        </div>
        {searchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 max-h-48 overflow-y-auto border-b border-slate-100 bg-white shadow-lg">
            {searchResults.map((result, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectResult(result)}
                className="w-full border-b border-slate-50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-teal-50"
              >
                <span className="text-[10px] font-black uppercase text-teal-700">{result.type}</span>
                <p className="mt-0.5 line-clamp-2 text-xs font-medium text-slate-700">{result.displayName}</p>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={fullHeight ? 'h-full w-full' : 'h-64 w-full'}>
        <div ref={containerRef} className="h-full w-full" />
      </div>
      {!fullHeight && (
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs font-bold text-slate-600">
        <span>Drag the pin or tap the map to set the entrance.</span>
        <span className="font-mono text-[10px] text-slate-400">
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </span>
      </div>
      )}
    </div>
  );
}
