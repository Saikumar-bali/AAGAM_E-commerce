import axios from 'axios';
import { Injectable } from '@nestjs/common';

declare const process: any;

function getMapboxToken(): string | null {
  const token = process.env?.NEXT_PUBLIC_MAPBOX_TOKEN || process.env?.MAPBOX_SECRET_TOKEN || null;
  if (token && typeof token === 'string' && token.startsWith('pk.')) return token;
  return null;
}

// Places API (New) key. A dedicated maps key wins; otherwise reuse the Firebase
// web key — both are Google API keys, Places just needs to be enabled in console.
function getGooglePlacesKey(): string | null {
  const key = process.env?.GOOGLE_MAPS_API_KEY || process.env?.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env?.FIREBASE_WEB_API_KEY || null;
  if (key && typeof key === 'string' && key.startsWith('AIza')) return key;
  return null;
}

type NominatimAddress = {
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country_code?: string;
};

type NominatimResponse = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: NominatimAddress;
};

type ForwardAddressInput = {
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
  country?: string | null;
};

const NOMINATIM_HEADERS = {
  'User-Agent': 'AagamEcommerce/1.0 (delivery address geocoding)',
  Accept: 'application/json',
};

@Injectable()
export class GeoService {
  async reverse(lat: number, lng: number) {
    // Using OSM Nominatim. For production, consider a paid provider or your own proxy + caching.
    const url = 'https://nominatim.openstreetmap.org/reverse';

    let res: { status: number; data?: NominatimResponse } | null = null;
    try {
      const r = await axios.get<NominatimResponse>(url, {
        params: {
          format: 'jsonv2',
          lat,
          lon: lng,
          addressdetails: 1,
        },
        timeout: 15000,
        headers: NOMINATIM_HEADERS,
        validateStatus: () => true,
      });
      res = { status: r.status, data: r.data };
    } catch (e: any) {
      // Never 500 for reverse-geocode failures; checkout can still proceed with manual fill.
      return {
        ok: false,
        source: 'nominatim',
        status: 0,
        message: e?.message || 'Reverse geocode failed',
      };
    }

    if (res.status < 200 || res.status >= 300) {
      return {
        ok: false,
        source: 'nominatim',
        status: res.status,
      };
    }

    const a = res.data?.address || {};
    const city = a.city || a.town || a.village || a.county || '';
    const state = a.state || '';
    const pincode = a.postcode || '';
    const country = (a.country_code || 'IN').toUpperCase();

    // Keep line1 short and usable.
    const parts = [a.house_number, a.road].filter(Boolean);
    const line1 = parts.join(' ').trim() || (res.data?.display_name || '').split(',').slice(0, 2).join(',').trim();
    const landmark = a.suburb || a.neighbourhood || '';

    return {
      ok: true,
      source: 'nominatim',
      address: {
        line1,
        landmark,
        city,
        state,
        pincode,
        country,
      },
    };
  }

  async forward(input: ForwardAddressInput) {
    const fullQuery = [
      input.line1,
      input.line2,
      input.landmark,
      input.city,
      input.state,
      input.pincode,
      (input.country || 'IN').toUpperCase() === 'IN' ? 'India' : input.country,
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())
      .join(', ');

    const pincode = String(input.pincode || '').trim();
    const city = String(input.city || '').trim();
    const state = String(input.state || '').trim();

    // A single token Nominatim does not know (e.g. a small locality) makes the
    // free-text search return nothing, even though the pincode or city alone
    // resolve. Fall back through progressively simpler queries so a manual
    // address can still be placed on the delivery map.
    const candidates = [
      fullQuery,
      pincode,
      [city, state, 'India'].filter(Boolean).join(', '),
      city ? `${city}, India` : '',
    ].filter((value, index, all) => value.trim().length > 0 && all.indexOf(value) === index);

    let lastFailure: { ok: false; source: 'nominatim'; status: number; message?: string } | null = null;

    for (const candidate of candidates) {
      const result = await this.searchOnce(candidate);
      if (result.ok) return result;
      lastFailure = result;
      // Respect Nominatim's ~1 request/sec usage policy across fallback attempts.
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }

    return lastFailure ?? { ok: false as const, source: 'nominatim' as const, status: 0 };
  }

  async search(query: string) {
    const token = getMapboxToken();
    if (!token) {
      return { ok: false, source: 'mapbox', results: [], message: 'Mapbox token not configured' };
    }

    try {
      const response = await axios.get(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
        {
          params: {
            access_token: token,
            country: 'in',
            types: 'address,place,neighborhood,poi',
            autocomplete: true,
            limit: 5,
          },
          timeout: 10000,
          validateStatus: () => true,
        },
      );

      if (response.status < 200 || response.status >= 300) {
        return { ok: false, source: 'mapbox', status: response.status, results: [] };
      }

      const features = (response.data?.features || []).map((f: any) => ({
        displayName: f.place_name || f.text || '',
        lat: f.center?.[1] ?? 0,
        lng: f.center?.[0] ?? 0,
        type: f.place_type?.[0] || 'place',
      }));

      return { ok: true, source: 'mapbox', results: features };
    } catch (e: any) {
      return { ok: false, source: 'mapbox', results: [], message: e?.message || 'Search failed' };
    }
  }

  async placesAutocomplete(query: string, lat?: number, lng?: number) {
    const key = getGooglePlacesKey();
    if (!key) {
      return { ok: false, source: 'google', results: [], message: 'Google Places key not configured' };
    }

    // Default to Anakapalle center area if no coordinates provided
    const defaultLat = lat ?? 17.6913;
    const defaultLng = lng ?? 83.0039;

    try {
      const body: Record<string, unknown> = {
        input: query,
        regionCode: 'in',
        locationBias: {
          circle: {
            center: { latitude: defaultLat, longitude: defaultLng },
            radius: 25000, // 25km radius around Anakapalle
          },
        },
      };
      const response = await axios.post('https://places.googleapis.com/v1/places:autocomplete', body, {
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
        timeout: 10000,
        validateStatus: () => true,
      });

      if (response.status < 200 || response.status >= 300) {
        // Places API (New) not enabled or rejected — retry via legacy Places
        return this.legacyPlacesAutocomplete(query, key, defaultLat, defaultLng);
      }

      const results = (response.data?.suggestions || [])
        .map((s: any) => s?.placePrediction)
        .filter(Boolean)
        .slice(0, 5)
        .map((p: any) => ({
          placeId: p.placeId as string,
          displayName: p.structuredFormat?.mainText?.text && p.structuredFormat?.secondaryText?.text
            ? `${p.structuredFormat.mainText.text}, ${p.structuredFormat.secondaryText.text}`
            : p.text?.text || '',
          type: this.mapGooglePlaceType(p.types || []),
        }));

      return { ok: true, source: 'google', results };
    } catch (e: any) {
      return this.legacyPlacesAutocomplete(query, key, defaultLat, defaultLng);
    }
  }

  private async legacyPlacesAutocomplete(query: string, key: string, lat?: number, lng?: number) {
    // Default to Anakapalle area if no coordinates provided
    const defaultLat = lat ?? 17.6913;
    const defaultLng = lng ?? 83.0039;

    try {
      const params: Record<string, unknown> = {
        input: query,
        key,
        components: 'country:in',
        location: `${defaultLat},${defaultLng}`,
        radius: 25000, // 25km radius around Anakapalle
      };
      const response = await axios.get('https://maps.googleapis.com/maps/api/place/autocomplete/json', {
        params,
        timeout: 10000,
        validateStatus: () => true,
      });

      const status = response.data?.status;
      if (status !== 'OK' && status !== 'ZERO_RESULTS') {
        return this.textSearch(query, defaultLat, defaultLng);
      }

      const results = (response.data?.predictions || []).slice(0, 5).map((p: any) => ({
        placeId: p.place_id as string,
        displayName: p.description || p.formatted_address || '',
        type: this.mapGooglePlaceType(p.types || []),
      }));

      if (results.length > 0) return { ok: true, source: 'google', results };
      return this.textSearch(query, defaultLat, defaultLng);
    } catch (e: any) {
      return this.textSearch(query, defaultLat, defaultLng);
    }
  }

  async textSearch(query: string, lat?: number, lng?: number) {
    const key = getGooglePlacesKey();
    if (!key) {
      return { ok: false, source: 'google', results: [], message: 'Google Places key not configured' };
    }

    const defaultLat = lat ?? 17.6913;
    const defaultLng = lng ?? 83.0039;

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
        params: {
          query,
          key,
          location: `${defaultLat},${defaultLng}`,
          radius: 25000,
        },
        timeout: 10000,
        validateStatus: () => true,
      });

      const status = response.data?.status;
      if (status !== 'OK' && status !== 'ZERO_RESULTS') {
        return {
          ok: false,
          source: 'google',
          message: response.data?.error_message || status || 'Google Places text search failed',
          results: [],
        };
      }

      const results = (response.data?.results || []).slice(0, 5).map((r: any) => ({
        placeId: r.place_id as string,
        displayName: r.name && r.formatted_address ? `${r.name}, ${r.formatted_address}` : r.formatted_address || r.name || '',
        name: r.name as string,
        lat: r.geometry?.location?.lat ?? 0,
        lng: r.geometry?.location?.lng ?? 0,
        type: this.mapGooglePlaceType(r.types || []),
      }));

      return { ok: true, source: 'google', results };
    } catch (e: any) {
      return { ok: false, source: 'google', results: [], message: e?.message || 'Text search failed' };
    }
  }

  private mapGooglePlaceType(types: string[]): string {
    const priority = [
      'hospital', 'doctor', 'pharmacy', 'health',
      'school', 'secondary_school', 'primary_school', 'university',
      'restaurant', 'food', 'cafe', 'bakery', 'meal_takeaway',
      'supermarket', 'grocery_or_supermarket', 'convenience_store', 'store', 'shopping_mall',
      'hindu_temple', 'place_of_worship', 'church', 'mosque',
      'bank', 'atm',
      'park', 'lodging', 'gym', 'train_station', 'bus_station',
      'point_of_interest', 'establishment',
    ];
    for (const p of priority) {
      if (types.includes(p)) {
        const map: Record<string, string> = {
          hospital: 'Hospital', doctor: 'Clinic', pharmacy: 'Pharmacy', health: 'Healthcare',
          school: 'School', secondary_school: 'School', primary_school: 'School', university: 'College',
          restaurant: 'Restaurant', food: 'Restaurant', cafe: 'Cafe', bakery: 'Bakery', meal_takeaway: 'Restaurant',
          supermarket: 'Supermarket', store: 'Store', grocery_or_supermarket: 'Store', convenience_store: 'Store', shopping_mall: 'Shopping Mall',
          hindu_temple: 'Temple', place_of_worship: 'Place of Worship', church: 'Church', mosque: 'Mosque',
          bank: 'Bank', atm: 'ATM',
          park: 'Park', lodging: 'Hotel', gym: 'Gym', train_station: 'Railway Station', bus_station: 'Bus Station',
          point_of_interest: 'Landmark', establishment: 'Place',
        };
        return map[p] || 'Place';
      }
    }
    return 'Place';
  }

  async placeDetails(placeId: string) {
    const key = getGooglePlacesKey();
    if (!key) {
      return { ok: false, source: 'google', message: 'Google Places key not configured' };
    }

    try {
      const response = await axios.get(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
        headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'location,formattedAddress' },
        timeout: 10000,
        validateStatus: () => true,
      });

      if (response.status < 200 || response.status >= 300) {
        // Places API (New) not enabled for this key's project — retry via legacy Place Details
        return this.legacyPlaceDetails(placeId, key);
      }

      return {
        ok: true,
        source: 'google',
        lat: response.data?.location?.latitude,
        lng: response.data?.location?.longitude,
        formattedAddress: response.data?.formattedAddress,
      };
    } catch (e: any) {
      return this.legacyPlaceDetails(placeId, key);
    }
  }

  private async legacyPlaceDetails(placeId: string, key: string) {
    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
        params: { place_id: placeId, key, fields: 'geometry,formatted_address' },
        timeout: 10000,
        validateStatus: () => true,
      });

      const status = response.data?.status;
      if (status !== 'OK') {
        return {
          ok: false,
          source: 'google',
          message: response.data?.error_message || status || 'Google Places details failed',
        };
      }

      const location = response.data?.result?.geometry?.location;
      return {
        ok: true,
        source: 'google',
        lat: location?.lat,
        lng: location?.lng,
        formattedAddress: response.data?.result?.formatted_address,
      };
    } catch (e: any) {
      return { ok: false, source: 'google', message: e?.message || 'Details failed' };
    }
  }

  private async searchOnce(query: string) {
    try {
      const response = await axios.get<NominatimResponse[]>('https://nominatim.openstreetmap.org/search', {
        params: {
          format: 'jsonv2',
          q: query,
          addressdetails: 1,
          countrycodes: 'in',
          limit: 1,
        },
        timeout: 15000,
        headers: NOMINATIM_HEADERS,
        validateStatus: () => true,
      });
      if (response.status < 200 || response.status >= 300) {
        return { ok: false as const, source: 'nominatim' as const, status: response.status };
      }
      const result = response.data?.[0];
      const latitude = Number(result?.lat);
      const longitude = Number(result?.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return { ok: false as const, source: 'nominatim' as const, status: response.status, message: 'Address was not found' };
      }
      return {
        ok: true as const,
        source: 'nominatim' as const,
        latitude,
        longitude,
        displayName: result?.display_name || null,
      };
    } catch (error: any) {
      return {
        ok: false as const,
        source: 'nominatim' as const,
        status: 0,
        message: error?.message || 'Forward geocode failed',
      };
    }
  }
}
