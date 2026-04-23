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
  display_name?: string;
  address?: NominatimAddress;
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
        headers: {
          // Nominatim usage policy asks for an identifying UA.
          'User-Agent': 'AagamEcommerce/1.0 (checkout reverse geocode)',
          Accept: 'application/json',
        },
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
}
