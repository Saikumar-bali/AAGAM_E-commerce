'use client';

import React, { useRef, useCallback, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

interface SearchResult {
  lat: number;
  lng: number;
  displayName: string;
  type: string;
}

interface StoreLocationPickerProps {
  coords: { lat: number | null; lng: number | null };
  onCoordsChange: (lat: number, lng: number) => void;
  onAddressChange?: (address: { address: string; city: string; state: string; pincode: string }) => void;
  apiClient: any;
  searchPlaceholder?: string;
}

export function StoreLocationPicker({
  coords,
  onCoordsChange,
  onAddressChange,
  apiClient,
  searchPlaceholder = 'Search for address...',
}: StoreLocationPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const hasCoords = coords.lat != null && coords.lng != null;

  const doReverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      if (!onAddressChange) return;
      try {
        const res = await apiClient.get('/geo/reverse', { params: { lat, lng } });
        const data = res.data;
        if (data?.ok && data?.address) {
          const a = data.address;
          onAddressChange({ address: a.line1 || '', city: a.city || '', state: a.state || '', pincode: a.pincode || '' });
        }
      } catch {
        // Reverse geocode is helpful, but address saving must not fail if it is unavailable.
      }
    },
    [apiClient, onAddressChange]
  );

  const handleSearch = useCallback(
    async (query: string) => {
      if (query.trim().length < 3) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      setSearchError('');
      try {
        const res = await apiClient.get('/geo/search', { params: { q: query } });
        const data = res.data;
        if (data.ok && Array.isArray(data.results)) {
          setSearchResults(data.results);
        } else {
          setSearchResults([]);
          setSearchError('No results found');
        }
      } catch (err: any) {
        setSearchError(err?.response?.data?.message || 'Search failed');
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [apiClient]
  );

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleSearch(value), 400);
  };

  const handleSelectResult = async (result: SearchResult) => {
    setSearchQuery(result.displayName.split(',')[0]);
    setSearchResults([]);
    setLocationAccuracy(null);
    onCoordsChange(result.lat, result.lng);
    await doReverseGeocode(result.lat, result.lng);
  };

  const handleUseCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setSearchError('Geolocation not available in this browser.');
      return;
    }
    setLocating(true);
    setSearchError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLocationAccuracy(pos.coords.accuracy ?? null);
        setSearchQuery('Current location');
        onCoordsChange(lat, lng);
        await doReverseGeocode(lat, lng);
        setLocating(false);
      },
      (error) => {
        const reason = error?.code === 1 ? 'Location permission was blocked. Allow location permission in the browser and try again.' : 'Could not get your exact location. Please search manually or pin on the map.';
        setSearchError(reason);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const renderMap = () => {
    const { MapContainer, TileLayer, Circle, CircleMarker, useMap, useMapEvents } = require('react-leaflet');
    require('leaflet/dist/leaflet.css');

    const markerPos: [number, number] = hasCoords ? [coords.lat as number, coords.lng as number] : [20.5937, 78.9629];
    const mapZoom = hasCoords ? 18 : 5;
    const mapKey = hasCoords ? `${coords.lat?.toFixed(6)}-${coords.lng?.toFixed(6)}` : 'india-default';

    const MapRecenter = ({ center, zoom }: { center: [number, number]; zoom: number }) => {
      const map = useMap();
      React.useEffect(() => {
        const recenter = () => {
          map.invalidateSize(true);
          map.setView(center, zoom, { animate: false });
          map.flyTo(center, zoom, { animate: true, duration: 0.35 });
        };
        recenter();
        const first = window.setTimeout(recenter, 80);
        const second = window.setTimeout(recenter, 350);
        return () => {
          window.clearTimeout(first);
          window.clearTimeout(second);
        };
      }, [map, center[0], center[1], zoom]);
      return null;
    };

    const MapClick = ({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) => {
      useMapEvents({ click: (e: any) => onMapClick(e.latlng.lat, e.latlng.lng) });
      return null;
    };

    return (
      <MapContainer
        key={mapKey}
        center={markerPos}
        zoom={mapZoom}
        minZoom={3}
        maxZoom={19}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <MapRecenter center={markerPos} zoom={mapZoom} />
        <TileLayer
          attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
          url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        />
        {hasCoords && locationAccuracy && locationAccuracy < 5000 && (
          <Circle
            center={[coords.lat as number, coords.lng as number]}
            radius={locationAccuracy}
            pathOptions={{ color: '#0f766e', fillColor: '#14b8a6', fillOpacity: 0.12, weight: 1 }}
          />
        )}
        {hasCoords && (
          <CircleMarker
            center={[coords.lat as number, coords.lng as number]}
            radius={10}
            pathOptions={{ color: '#ffffff', fillColor: '#ef4444', fillOpacity: 1, weight: 4 }}
          />
        )}
        {hasCoords && (
          <CircleMarker
            center={[coords.lat as number, coords.lng as number]}
            radius={3}
            pathOptions={{ color: '#7f1d1d', fillColor: '#7f1d1d', fillOpacity: 1, weight: 1 }}
          />
        )}
        <MapClick onMapClick={async (lat: number, lng: number) => { setLocationAccuracy(null); onCoordsChange(lat, lng); await doReverseGeocode(lat, lng); }} />
      </MapContainer>
    );
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleUseCurrentLocation}
        disabled={locating}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold hover:bg-emerald-100 transition-colors disabled:opacity-50"
      >
        {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
        {locating ? 'Getting exact location...' : 'Use live location'}
      </button>

      <div className="relative">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-gray-400"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
          )}
        </div>

        {searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
            {searchResults.map((result, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectResult(result)}
                className="w-full text-left px-4 py-3 text-sm hover:bg-emerald-50 border-b border-gray-50 last:border-0 transition-colors"
              >
                <span className="text-[10px] font-black text-emerald-700 uppercase">{result.type}</span>
                <p className="text-gray-900 font-medium mt-0.5 line-clamp-2">{result.displayName}</p>
              </button>
            ))}
          </div>
        )}

        {searchError && <p className="mt-1 text-xs text-red-600 font-medium">{searchError}</p>}
      </div>

      {hasCoords && (
        <div className="flex items-center gap-2 text-xs font-mono text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
          <MapPin className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
          <span>Lat: {coords.lat?.toFixed(6)}, Lng: {coords.lng?.toFixed(6)}{locationAccuracy ? `, Accuracy: ${Math.round(locationAccuracy)}m` : ''}</span>
        </div>
      )}

      <div className="rounded-xl overflow-hidden border border-gray-200 h-72 bg-gray-50">
        {isMounted ? renderMap() : (
          <div className="h-full w-full flex items-center justify-center bg-gray-100">
            <span className="text-xs text-gray-400">Loading map...</span>
          </div>
        )}
      </div>

      {hasCoords && (
        <p className="text-xs text-gray-500 text-center">Click the map to fine-tune location</p>
      )}
    </div>
  );
}
