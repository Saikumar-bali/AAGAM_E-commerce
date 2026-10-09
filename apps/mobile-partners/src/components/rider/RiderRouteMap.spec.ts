import { RIDER_MAP_STYLES, buildRiderMapHtml } from './riderRouteMapHtml';

describe('RiderRouteMap', () => {
  it('builds a Mapbox view with attribution and live rider updates', () => {
    const html = buildRiderMapHtml({ latitude: 28.6139, longitude: 77.209 }, 'Green Leaf <Store>');
    expect(html).toContain('api.mapbox.com/mapbox-gl-js');
    expect(html).toContain('mapboxgl.Map');
    expect(html).toContain('window.setRiderLocation');
    expect(html).toContain('window.clearRiderLocation');
    expect(html).toContain('rider-route');
    expect(html).toContain('Green Leaf');
    expect(html).not.toContain('tile.openstreetmap.org');
    expect(html).not.toContain('googleapis.com/maps/api/js');
  });

  it('defaults to a satellite view and exposes a style toggle', () => {
    const html = buildRiderMapHtml({ latitude: 12.9716, longitude: 77.5946 }, 'Store');
    expect(RIDER_MAP_STYLES.satellite).toBe('mapbox://styles/mapbox/satellite-streets-v12');
    expect(html).toContain(RIDER_MAP_STYLES.satellite);
    expect(html).toContain('mapbox://styles/mapbox/satellite-streets-v12');
    expect(html).toContain('window.setRiderMapStyle');
    expect(html).toContain('map-style-toggle');
    expect(html).toContain('map.on(\'style.load\'');
  });

  it('honours an explicit streets fallback style', () => {
    const html = buildRiderMapHtml({ latitude: 12.9716, longitude: 77.5946 }, 'Store', null, { initialStyle: 'streets' });
    expect(html).toContain("var currentStyle = 'streets'");
  });
});
