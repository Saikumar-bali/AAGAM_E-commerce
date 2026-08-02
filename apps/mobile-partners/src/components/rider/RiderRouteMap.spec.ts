import { buildRiderMapHtml } from './riderRouteMapHtml';

describe('RiderRouteMap', () => {
  it('builds a free OpenStreetMap view with attribution and live rider updates', () => {
    const html = buildRiderMapHtml({ latitude: 28.6139, longitude: 77.209 }, 'Green Leaf <Store>');
    expect(html).toContain('tile.openstreetmap.org');
    expect(html).toContain('OpenStreetMap contributors');
    expect(html).toContain('window.setRiderLocation');
    expect(html).toContain('Green Leaf &lt;Store&gt;');
    expect(html).not.toContain('googleapis.com/maps/api/js');
  });
});
