export type MapCoordinate = { latitude: number; longitude: number };

export type RiderMapStyleId = 'satellite' | 'streets';

// Satellite imagery with street/place labels on top, so riders can still read
// names while seeing the actual layout. `streets` is offered as a fallback view.
export const RIDER_MAP_STYLES: Record<RiderMapStyleId, string> = {
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  streets: 'mapbox://styles/mapbox/streets-v12',
};

function getMapboxToken(explicitToken?: string | null): string | null {
  const token =
    explicitToken ||
    (typeof process !== 'undefined' && ((process.env as any).EXPO_PUBLIC_MAPBOX_TOKEN || (process.env as any).NEXT_PUBLIC_MAPBOX_TOKEN)) ||
    null;
  if (token && typeof token === 'string' && token.startsWith('pk.')) return token;
  // Jest: allow unit tests to generate map HTML without real token
  if (typeof process !== 'undefined' && ((process.env as any).NODE_ENV === 'test' || (process.env as any).JEST_WORKER_ID || (process.env as any).PLAYWRIGHT_TEST)) {
    return 'pk.test-dummy-token-for-jest';
  }
  return null;
}

type BuildRiderMapHtmlOptions = {
  initialStyle?: RiderMapStyleId;
};

export const buildRiderMapHtml = (
  destination: MapCoordinate,
  label: string,
  explicitToken?: string | null,
  options: BuildRiderMapHtmlOptions = {},
) => {
  const token = getMapboxToken(explicitToken);
  if (!token) {
    return `<!doctype html><html><body style="display:flex;align-items:center;justify-content:center;height:100%;margin:0;color:#999;font-family:system-ui;">Map unavailable – missing Mapbox token</body></html>`;
  }
  const safeLabelJson = JSON.stringify(label);
  const initialStyle: RiderMapStyleId = options.initialStyle && RIDER_MAP_STYLES[options.initialStyle] ? options.initialStyle : 'satellite';
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<link href="https://api.mapbox.com/mapbox-gl-js/v3.29.0/mapbox-gl.css" rel="stylesheet" />
<style>
html,body,#map{height:100%;margin:0;background:#e8f3ef}
.mapboxgl-ctrl-logo{margin:0 0 6px 6px !important;opacity:.85}
.map-style-toggle{position:absolute;top:10px;right:10px;z-index:5;display:flex;align-items:center;gap:6px;height:34px;padding:0 12px;border:1px solid rgba(15,23,42,.12);border-radius:999px;background:rgba(255,255,255,.94);color:#0f172a;font:600 12px/1 system-ui,-apple-system,sans-serif;box-shadow:0 2px 8px rgba(15,23,42,.16);cursor:pointer}
.map-style-toggle:active{transform:scale(.96)}
.rider-pulse{position:relative;width:18px;height:18px;border-radius:50%;background:#1687ff;border:3px solid #fff;box-shadow:0 0 0 2px rgba(15,23,42,.25),0 1px 4px rgba(15,23,42,.45)}
.rider-pulse::after{content:'';position:absolute;inset:-9px;border-radius:50%;border:2px solid rgba(22,135,255,.55);animation:riderPulse 2s ease-out infinite}
@keyframes riderPulse{0%{transform:scale(.35);opacity:.9}100%{transform:scale(1.4);opacity:0}}
.dest-pin{position:relative;width:24px;height:24px;border-radius:50% 50% 50% 0;background:#dc2626;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(15,23,42,.45)}
.dest-pin::after{content:'';position:absolute;top:7px;left:7px;width:7px;height:7px;border-radius:50%;background:#fff}
</style>
</head><body><div id="map"></div><script src="https://api.mapbox.com/mapbox-gl-js/v3.29.0/mapbox-gl.js"></script><script>
mapboxgl.accessToken = '${token}';
var STYLES = { satellite: '${RIDER_MAP_STYLES.satellite}', streets: '${RIDER_MAP_STYLES.streets}' };
var currentStyle = '${initialStyle}';
var destination = [${destination.longitude}, ${destination.latitude}];
var destLabel = ${safeLabelJson};
var map = new mapboxgl.Map({ container: 'map', style: STYLES[currentStyle], center: destination, zoom: 15, attributionControl: true, language: 'en' });

var destEl = document.createElement('div');
destEl.className = 'dest-pin';
new mapboxgl.Marker({ element: destEl, anchor: 'bottom' })
  .setLngLat(destination)
  .setPopup(new mapboxgl.Popup({ offset: 18, closeButton: false }).setText(destLabel))
  .addTo(map);

var riderMarker = null;
var routeSourceAdded = false;
var mapLoaded = false;
var pendingPoint = null;
var lastRiderPoint = null;

function ensureRoute(point, dest) {
  if (!mapLoaded || !map.isStyleLoaded()) { pendingPoint = point; return; }
  var geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: [point, dest] } };
  if (!routeSourceAdded) {
    try {
      map.addSource('rider-route', { type: 'geojson', data: geojson });
      map.addLayer({ id: 'rider-route-line', type: 'line', source: 'rider-route', paint: { 'line-color': '#008c68', 'line-width': 5, 'line-opacity': 0.9, 'line-dasharray': [1, 2] } });
      routeSourceAdded = true;
    } catch (e) { pendingPoint = point; }
  } else {
    var src = map.getSource('rider-route');
    if (src) src.setData(geojson);
  }
}

function removeRoute() {
  if (!map.isStyleLoaded()) return;
  if (map.getLayer('rider-route-line')) map.removeLayer('rider-route-line');
  if (map.getSource('rider-route')) map.removeSource('rider-route');
  routeSourceAdded = false;
}

function fitRoute(point, dest) {
  var bounds = new mapboxgl.LngLatBounds();
  bounds.extend(point);
  bounds.extend(dest);
  try { map.fitBounds(bounds, { padding: { top: 56, bottom: 72, left: 48, right: 48 }, maxZoom: 16, duration: 500 }); } catch (e) {}
}

function applyRider(point) {
  lastRiderPoint = point;
  if (!riderMarker) {
    var el = document.createElement('div');
    el.className = 'rider-pulse';
    riderMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat(point)
      .setPopup(new mapboxgl.Popup({ offset: 12, closeButton: false }).setText('You are here'))
      .addTo(map);
  } else {
    riderMarker.setLngLat(point);
  }
  ensureRoute(point, destination);
  fitRoute(point, destination);
}

window.setRiderLocation = function (lat, lng) {
  var point = [lng, lat];
  if (!mapLoaded || !map.isStyleLoaded()) { pendingPoint = point; return; }
  applyRider(point);
};

window.clearRiderLocation = function () {
  if (riderMarker) { riderMarker.remove(); riderMarker = null; }
  if (routeSourceAdded) removeRoute();
  pendingPoint = null;
  lastRiderPoint = null;
};

window.setRiderMapStyle = function (id) {
  if (!STYLES[id]) return;
  currentStyle = id;
  map.setStyle(STYLES[id]);
};

var toggle = document.createElement('button');
toggle.type = 'button';
toggle.className = 'map-style-toggle';
toggle.textContent = currentStyle === 'satellite' ? 'Satellite' : 'Streets';
toggle.addEventListener('click', function () {
  var next = currentStyle === 'satellite' ? 'streets' : 'satellite';
  toggle.textContent = next === 'satellite' ? 'Satellite' : 'Streets';
  window.setRiderMapStyle(next);
});
document.body.appendChild(toggle);

// Mapbox discards custom sources/layers on any style change, so re-add the
// route once the new style finishes loading.
map.on('style.load', function () {
  if (!mapLoaded) return;
  routeSourceAdded = false;
  var point = pendingPoint || lastRiderPoint;
  if (point) {
    ensureRoute(point, destination);
    pendingPoint = null;
  }
});

function flushPending() {
  if (mapLoaded) return true;
  if (map.getStyle() && map.isStyleLoaded()) {
    mapLoaded = true;
    map.resize();
    if (pendingPoint) {
      applyRider(pendingPoint);
      pendingPoint = null;
    }
    return true;
  }
  return false;
}

map.on('load', flushPending);

// Safety net for slow mobile connections where the load event may be delayed:
// keep flushing until the style is ready (bounded so we never spin forever).
var flushTries = 0;
var flushTimer = setInterval(function () {
  if (flushPending() || ++flushTries > 40) clearInterval(flushTimer);
}, 500);
</script></body></html>`;
};