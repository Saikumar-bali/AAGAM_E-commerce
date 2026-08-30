import { buildRiderMapHtml } from './riderRouteMapHtml';

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
});
