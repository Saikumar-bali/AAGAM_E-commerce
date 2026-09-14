'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getMapboxToken } from '@/lib/mapbox';
import { apiClient } from '@aagam/utils';
import { MapPin, Search, X } from 'lucide-react';

function createPinElement(): HTMLElement {
  const el = document.createElement('div');
  el.style.width = '44px';
  el.style.height = '44px';
  el.style.cursor = 'grab';
  el.innerHTML = '<div style="width:44px;height:44px;border-radius:22px 22px 22px 5px;transform:rotate(-45deg);background:#0f766e;border:4px solid white;box-shadow:0 8px 24px rgba(15,23,42,.25);display:flex;align-items:center;justify-content:center"><div style="width:12px;height:12px;border-radius:50%;background:white;margin:12px;transform:rotate(45deg)"></div></div>';
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

function getBadgeStyle(type: string): string {
  const t = (type || '').toLowerCase();
  if (t.includes('hospital') || t.includes('clinic') || t.includes('pharmacy')) return 'bg-rose-100 text-rose-800 border-rose-200';
  if (t.includes('school') || t.includes('college') || t.includes('university')) return 'bg-indigo-100 text-indigo-800 border-indigo-200';
  if (t.includes('restaurant') || t.includes('cafe') || t.includes('bakery')) return 'bg-amber-100 text-amber-800 border-amber-200';
  if (t.includes('temple') || t.includes('worship') || t.includes('church') || t.includes('mosque')) return 'bg-purple-100 text-purple-800 border-purple-200';
  if (t.includes('store') || t.includes('supermarket') || t.includes('mall')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (t.includes('bank') || t.includes('atm')) return 'bg-blue-100 text-blue-800 border-blue-200';
  return 'bg-teal-100 text-teal-800 border-teal-200';
}

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
        // proxy unavailable (or Places not enabled) — fall back below
      }
      // Google Places Text Search — finds specific POIs that autocomplete misses
      try {
        const { data } = await apiClient.get('/geo/places/textsearch', {
          params: { q: query.trim(), lat: latitude, lng: longitude },
        });
        if (data?.ok && Array.isArray(data.results) && data.results.length > 0) {
          setSearchResults(data.results);
          return;
        }
      } catch {
        // fall back to Mapbox below
      }
      const token = getMapboxToken();
      if (!token) { setSearchResults([]); return; }
      // Bounding box around Anakapalle and nearby areas (Visakhapatnam region)
      const bbox = '82.7,17.5,83.3,17.9';
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&types=address,place,neighborhood,poi&autocomplete=true&limit=5&proximity=${longitude},${latitude}&bbox=${bbox}`
      );
      const data = await res.json();
      const features = (data.features || [])
        .map((f: any) => ({
          displayName: f.place_name || f.text || '',
          lat: f.center?.[1],
          lng: f.center?.[0],
          type: f.place_type?.[0] || 'place',
        }))
        .filter((f: any) => Number.isFinite(f.lat) && Number.isFinite(f.lng) && !(Math.abs(f.lat) < 0.0001 && Math.abs(f.lng) < 0.0001));
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
    if (result.placeId && (!result.lat || !result.lng || (Math.abs(result.lat) < 0.0001 && Math.abs(result.lng) < 0.0001))) {
      try {
        const { data } = await apiClient.get('/geo/places/details', { params: { placeId: result.placeId } });
        if (data?.ok && Number.isFinite(data.lat) && Number.isFinite(data.lng) && !(Math.abs(data.lat) < 0.0001 && Math.abs(data.lng) < 0.0001)) {
          flyTo(data.lat, data.lng);
        }
      } catch {
        // could not resolve coordinates — leave the pin where it is
      }
      return;
    }
    if (Number.isFinite(result.lat) && Number.isFinite(result.lng) && !(Math.abs(result.lat) < 0.0001 && Math.abs(result.lng) < 0.0001)) {
      flyTo(result.lat, result.lng);
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const token = getMapboxToken();
    const hasMapboxToken = Boolean(token && token.startsWith('pk.') && token !== 'pk.test-dummy-token-for-jest');
    if (hasMapboxToken && token) {
      mapboxgl.accessToken = token;
    } else {
      mapboxgl.accessToken = 'pk.eyJ1IjoiZmFsbGJhY2siLCJhIjoiY20wMCJ9.none';
    }

    const osmFallbackStyle: any = {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: [
            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
          ],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap contributors',
        },
      },
      layers: [
        {
          id: 'osm-tiles-layer',
          type: 'raster',
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    };

    const map = new mapboxgl.Map({
      container,
      style: hasMapboxToken ? 'mapbox://styles/mapbox/satellite-streets-v12' : osmFallbackStyle,
      center: [longitude, latitude],
      zoom: 17,
      attributionControl: true,
    });

    let hasFallenBack = false;
    map.on('error', (e: any) => {
      if (hasFallenBack) return;
      const status = e?.error?.status || e?.status;
      const msg = String(e?.error?.message || e?.message || '');
      if (status === 401 || msg.includes('401') || msg.includes('Not Authorized') || msg.includes('Invalid Token')) {
        hasFallenBack = true;
        try {
          map.setStyle(osmFallbackStyle);
        } catch {}
      }
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
            placeholder="Search address, school, hospital, restaurant, temple..."
            className="w-full border-b border-slate-100 bg-white py-3 pl-10 pr-20 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
          {searching && <div className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-slate-400">...</div>}
        </div>
        {searchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 max-h-56 overflow-y-auto border-b border-slate-100 bg-white shadow-xl divide-y divide-slate-100">
            {searchResults.map((result, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectResult(result)}
                className="w-full px-4 py-2.5 text-left transition-colors hover:bg-teal-50/70 flex items-start gap-2.5"
              >
                <span className={`mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${getBadgeStyle(result.type)}`}>
                  {result.type}
                </span>
                <p className="min-w-0 flex-1 text-xs font-semibold text-slate-800 leading-snug">{result.displayName}</p>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={fullHeight ? 'h-full w-full' : 'h-64 w-full'}>
        <div ref={containerRef} className="h-full w-full" />
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs font-bold text-slate-600">
        {/* <span>Drag the pin or tap the map to set the entrance.</span>
        <span className="font-mono text-[10px] text-slate-400">
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </span> */}
      </div>
    </div>
  );
}
