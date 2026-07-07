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
  compact?: boolean;
}

const TILE_SIZE = 256;
const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };
const DEFAULT_ZOOM = 5;
const LOCATION_ZOOM = 16;
const MIN_ZOOM = 3;
const MAX_ZOOM = 18;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeLng(lng: number) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

function latLngToWorldPixel(lat: number, lng: number, zoom: number) {
  const safeLat = clamp(lat, -85.05112878, 85.05112878);
  const sinLat = Math.sin((safeLat * Math.PI) / 180);
  const scale = TILE_SIZE * 2 ** zoom;
  return {
    x: ((normalizeLng(lng) + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function worldPixelToLatLng(x: number, y: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng: normalizeLng(lng) };
}

function getTileUrl(x: number, y: number, zoom: number) {
  const tilesPerSide = 2 ** zoom;
  const wrappedX = ((x % tilesPerSide) + tilesPerSide) % tilesPerSide;
  const clampedY = clamp(y, 0, tilesPerSide - 1);
  return `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${clampedY}.png`;
}

function ControlledOsmMap({
  lat,
  lng,
  zoom,
  compact,
  onPick,
}: {
  lat: number;
  lng: number;
  zoom: number;
  compact: boolean;
  onPick: (lat: number, lng: number) => void;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const center = latLngToWorldPixel(lat, lng, zoom);
  const tileX = Math.floor(center.x / TILE_SIZE);
  const tileY = Math.floor(center.y / TILE_SIZE);
  const offsetX = center.x - tileX * TILE_SIZE;
  const offsetY = center.y - tileY * TILE_SIZE;
  const tiles = [];

  for (let dx = -2; dx <= 2; dx += 1) {
    for (let dy = -2; dy <= 2; dy += 1) {
      tiles.push({
        key: `${zoom}-${tileX + dx}-${tileY + dy}`,
        x: tileX + dx,
        y: tileY + dy,
        left: `calc(50% + ${(dx * TILE_SIZE - offsetX).toFixed(2)}px)`,
        top: `calc(50% + ${(dy * TILE_SIZE - offsetY).toFixed(2)}px)`,
      });
    }
  }

  const handleMapClick = async (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    const next = worldPixelToLatLng(center.x + dx, center.y + dy, zoom);
    onPick(next.lat, next.lng);
  };

  return (
    <div
      ref={mapRef}
      onClick={handleMapClick}
      className={`relative w-full overflow-hidden rounded-xl border border-gray-200 bg-sky-50 ${compact ? 'h-56' : 'h-72'}`}
      role="button"
      tabIndex={0}
      title="Click map to fine-tune location"
    >
      {tiles.map((tile) => (
        <img
          key={tile.key}
          src={getTileUrl(tile.x, tile.y, zoom)}
          alt=""
          draggable={false}
          className="absolute h-64 w-64 select-none"
          style={{ left: tile.left, top: tile.top }}
        />
      ))}

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,transparent_45%,rgba(15,23,42,0.06)_100%)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-full">
        <div className="relative">
          <div className="h-10 w-10 rotate-45 rounded-full rounded-br-sm border-4 border-white bg-red-500 shadow-xl shadow-slate-900/30" />
          <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
        </div>
        <div className="mx-auto mt-1 h-2 w-8 rounded-full bg-slate-900/25 blur-[1px]" />
      </div>
      <div className="pointer-events-none absolute bottom-2 right-2 z-20 rounded bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm">
        © OpenStreetMap
      </div>
    </div>
  );
}

export function StoreLocationPicker({
  coords,
  onCoordsChange,
  onAddressChange,
  apiClient,
  searchPlaceholder = 'Search for address...',
  compact = false,
}: StoreLocationPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mapLat = Number(coords.lat);
  const mapLng = Number(coords.lng);
  const hasValidCoords = coords.lat != null && coords.lng != null && Number.isFinite(mapLat) && Number.isFinite(mapLng);
  const centerLat = hasValidCoords ? mapLat : DEFAULT_CENTER.lat;
  const centerLng = hasValidCoords ? mapLng : DEFAULT_CENTER.lng;
  const zoom = manualZoom ?? (hasValidCoords ? LOCATION_ZOOM : DEFAULT_ZOOM);

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
        // Reverse geocode is optional. Coordinates remain usable even when it fails.
      }
    },
    [apiClient, onAddressChange]
  );

  const setPickedCoords = async (lat: number, lng: number) => {
    setLocationAccuracy(null);
    onCoordsChange(lat, lng);
    await doReverseGeocode(lat, lng);
  };

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
    const lat = Number(result.lat);
    const lng = Number(result.lng);
    setSearchQuery(result.displayName.split(',')[0]);
    setSearchResults([]);
    setManualZoom(LOCATION_ZOOM);
    await setPickedCoords(lat, lng);
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
        const lat = Number(pos.coords.latitude);
        const lng = Number(pos.coords.longitude);
        setLocationAccuracy(pos.coords.accuracy ?? null);
        setSearchQuery('Current location');
        setManualZoom(LOCATION_ZOOM);
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

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={locating}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-50"
        >
          {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
          {locating ? 'Getting exact location...' : 'Use live location'}
        </button>
        <div className="ml-auto flex overflow-hidden rounded-xl border border-gray-200 bg-white text-xs font-black text-gray-700">
          <button type="button" onClick={() => setManualZoom((prev) => clamp((prev ?? zoom) + 1, MIN_ZOOM, MAX_ZOOM))} className="px-3 py-2 hover:bg-gray-50">+</button>
          <button type="button" onClick={() => setManualZoom((prev) => clamp((prev ?? zoom) - 1, MIN_ZOOM, MAX_ZOOM))} className="border-l border-gray-200 px-3 py-2 hover:bg-gray-50">−</button>
        </div>
      </div>

      <div className="relative">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />}
        </div>

        {searchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-xl">
            {searchResults.map((result, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectResult(result)}
                className="w-full border-b border-gray-50 px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-emerald-50"
              >
                <span className="text-[10px] font-black uppercase text-emerald-700">{result.type}</span>
                <p className="mt-0.5 line-clamp-2 font-medium text-gray-900">{result.displayName}</p>
              </button>
            ))}
          </div>
        )}

        {searchError && <p className="mt-1 text-xs font-medium text-red-600">{searchError}</p>}
      </div>

      {hasValidCoords && (
        <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-500">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
          <span>Lat: {mapLat.toFixed(6)}, Lng: {mapLng.toFixed(6)}{locationAccuracy ? `, Accuracy: ${Math.round(locationAccuracy)}m` : ''}</span>
        </div>
      )}

      <ControlledOsmMap
        lat={centerLat}
        lng={centerLng}
        zoom={zoom}
        compact={compact}
        onPick={setPickedCoords}
      />

      {hasValidCoords && <p className="text-center text-xs text-gray-500">Click the map to fine-tune location</p>}
    </div>
  );
}
