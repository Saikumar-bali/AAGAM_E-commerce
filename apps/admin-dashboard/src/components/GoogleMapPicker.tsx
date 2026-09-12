'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, Loader2, Search, X } from 'lucide-react';

declare global {
  interface Window {
    google?: any;
    initGoogleMapPicker?: () => void;
  }
}

type Props = {
  latitude: number;
  longitude: number;
  onChange: (lat: number, lng: number) => void;
  height?: string;
};

export default function GoogleMapPicker({ latitude, longitude, onChange, height = '100%' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const loadGoogleMapsScript = useCallback(() => {
    if (window.google?.maps) return Promise.resolve();
    if (document.querySelector('script[data-gmaps-picker]')) {
      return new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (window.google?.maps) { clearInterval(check); resolve(); }
        }, 100);
      });
    }
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    return new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMapPicker`;
      script.async = true;
      script.defer = true;
      script.setAttribute('data-gmaps-picker', 'true');
      window.initGoogleMapPicker = () => { resolve(); };
      script.onerror = () => reject(new Error('Failed to load Google Maps'));
      document.head.appendChild(script);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        await loadGoogleMapsScript();
        if (cancelled || !containerRef.current) return;

        const center = latitude && longitude ? { lat: latitude, lng: longitude } : { lat: 17.6866, lng: 83.2185 };
        const map = new window.google!.maps.Map(containerRef.current, {
          center,
          zoom: 17,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          mapTypeId: 'satellite',
          gestureHandling: 'greedy',
        });
        mapRef.current = map;

        const marker = new window.google!.maps.Marker({
          position: center,
          map,
          draggable: true,
          title: 'Delivery location',
        });
        markerRef.current = marker;

        marker.addListener('dragend', () => {
          const pos = marker.getPosition();
          if (pos) onChangeRef.current(pos.lat(), pos.lng());
        });

        map.addListener('click', (e: any) => {
          if (e.latLng) {
            marker.setPosition(e.latLng);
            onChangeRef.current(e.latLng.lat(), e.latLng.lng());
          }
        });

        if (searchInputRef.current) {
          const autocomplete = new window.google!.maps.places.Autocomplete(searchInputRef.current, {
            fields: ['geometry', 'formatted_address', 'name'],
          });
          autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.geometry?.location) {
              const loc = place.geometry.location;
              map.panTo(loc);
              map.setZoom(17);
              marker.setPosition(loc);
              onChangeRef.current(loc.lat(), loc.lng());
            }
          });
          autocompleteRef.current = autocomplete;
        }

        setLoading(false);
      } catch (err) {
        console.error('[GoogleMapPicker]', err);
        setLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [loadGoogleMapsScript]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    if (latitude && longitude) {
      const pos = new window.google!.maps.LatLng(latitude, longitude);
      marker.setPosition(pos);
      map.panTo(pos);
      if (map.getZoom() < 17) map.setZoom(17);
    }
  }, [latitude, longitude]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        onChangeRef.current(lat, lng);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-teal-200 bg-white">
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search address..."
            className="w-full border-b border-slate-100 bg-white py-3 pl-10 pr-20 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={useMyLocation}
          className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-white px-3 py-1.5 text-[10px] font-black text-teal-700 shadow-sm hover:bg-teal-50"
        >
          <Crosshair className="h-3 w-3" /> Use my live location
        </button>
      </div>
      <div style={{ height, minHeight: '16rem', position: 'relative' }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
            <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
          </div>
        )}
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
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
