import axios from 'axios';
import { Injectable } from '@nestjs/common';

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
    const query = [
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
        return { ok: false as const, source: 'nominatim', status: response.status };
      }
      const result = response.data?.[0];
      const latitude = Number(result?.lat);
      const longitude = Number(result?.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return { ok: false as const, source: 'nominatim', status: response.status, message: 'Address was not found' };
      }
      return {
        ok: true as const,
        source: 'nominatim',
        latitude,
        longitude,
        displayName: result?.display_name || null,
      };
    } catch (error: any) {
      return {
        ok: false as const,
        source: 'nominatim',
        status: 0,
        message: error?.message || 'Forward geocode failed',
      };
    }
  }
}
