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

  it('draws a blue road-following navigation route with a turn-by-turn banner', () => {
    const html = buildRiderMapHtml({ latitude: 12.9716, longitude: 77.5946 }, 'Store');
    // Directions service drives the road-following geometry.
    expect(html).toContain('api.mapbox.com/directions/v5/mapbox/driving-traffic');
    expect(html).toContain('geometries=geojson');
    expect(html).toContain('steps=true');
    // Rapido-style blue navigation line with a dark casing under it.
    expect(html).toContain("'line-color': '#2563eb'");
    expect(html).toContain("'line-color': '#0b2f7a'");
    // Turn-by-turn banner + navigation camera.
    expect(html).toContain('map-nav-banner');
    expect(html).toContain('map-nav-instruction');
    expect(html).toContain('window.setNavigationMode');
    expect(html).toContain('pitch');
    expect(html).toContain('bearing');
  });

  it('always draws a blue route-ahead line towards the upcoming customers', () => {
    const html = buildRiderMapHtml({ latitude: 12.9716, longitude: 77.5946 }, 'Store', null, {
      stops: [
        { latitude: 12.972, longitude: 77.595, sequence: 1, id: 'a', label: 'A', status: 'READY', state: 'current' },
        { latitude: 12.974, longitude: 77.598, sequence: 2, id: 'b', label: 'B', status: 'READY', state: 'upcoming' },
      ],
    });
    // The preview line needs no GPS and no directions call: it is built from
    // the ordered stops, so a blue line is there from the first frame.
    expect(html).toContain("'rider-stops-preview'");
    expect(html).toContain("'rider-stops-preview-line'");
    expect(html).toContain('function previewCoords()');
    expect(html).toContain('renderPreviewLine();');
  });

  it('keeps the focused marker red regardless of its status skin', () => {
    // `.no-pin` used to be declared after `.current`, so the current stop
    // rendered teal; the current skin must win over every colliding one.
    const html = buildRiderMapHtml({ latitude: 12.9716, longitude: 77.5946 }, 'Store');
    expect(html).toContain('.stop-marker.current,.stop-marker.current.delivered,.stop-marker.current.partial,.stop-marker.current.failed,.stop-marker.current.no-pin,.stop-marker.current.skip{background:#dc2626');
  });
});
