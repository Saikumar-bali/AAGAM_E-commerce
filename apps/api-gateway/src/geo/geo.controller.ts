import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { GeoService } from './geo.service';

@Controller('geo')
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Get('reverse')
  async reverse(@Query('lat') latRaw: string, @Query('lng') lngRaw: string) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BadRequestException('lat and lng are required');
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new BadRequestException('lat/lng out of range');
    }

    return this.geoService.reverse(lat, lng);
  }

  @Get('search')
  async search(@Query('q') query: string) {
    if (!query || query.trim().length < 2) {
      throw new BadRequestException('q (query) is required');
    }
    return this.geoService.search(query.trim());
  }

  @Get('places/autocomplete')
  async placesAutocomplete(
    @Query('q') query: string,
    @Query('lat') latRaw?: string,
    @Query('lng') lngRaw?: string,
  ) {
    if (!query || query.trim().length < 2) {
      throw new BadRequestException('q (query) is required');
    }
    const lat = latRaw !== undefined ? Number(latRaw) : NaN;
    const lng = lngRaw !== undefined ? Number(lngRaw) : NaN;
    return this.geoService.placesAutocomplete(
      query.trim(),
      Number.isFinite(lat) ? lat : undefined,
      Number.isFinite(lng) ? lng : undefined,
    );
  }

  @Get('places/details')
  async placeDetails(@Query('placeId') placeId: string) {
    if (!placeId || !placeId.trim()) {
      throw new BadRequestException('placeId is required');
    }
    return this.geoService.placeDetails(placeId.trim());
  }
}

