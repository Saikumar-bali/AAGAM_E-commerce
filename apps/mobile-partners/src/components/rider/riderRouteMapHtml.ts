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
  stops?: RiderMapStop[];
};

export type RiderMapStop = {
  latitude: number;
  longitude: number;
  sequence: number;
  label?: string;
  state?: 'done' | 'current' | 'upcoming';
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
  const stopsJson = JSON.stringify(
    (options.stops || [])
      .filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude))
      .map((stop) => ({
        latitude: Number(stop.latitude),
        longitude: Number(stop.longitude),
        sequence: Number(stop.sequence) || 0,
        label: stop.label || '',
        state: stop.state || 'upcoming',
      })),
  );
  const initialStyle: RiderMapStyleId = options.initialStyle && RIDER_MAP_STYLES[options.initialStyle] ? options.initialStyle : 'satellite';
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<link href="https://api.mapbox.com/mapbox-gl-js/v3.29.0/mapbox-gl.css" rel="stylesheet" />
<style>
html,body,#map{height:100%;margin:0;background:#e8f3ef}
.mapboxgl-ctrl-logo{margin:0 0 6px 6px !important;opacity:.85}
.map-style-toggle{position:absolute;top:10px;right:10px;z-index:6;display:flex;align-items:center;height:30px;padding:0 12px;border:1px solid rgba(15,23,42,.12);border-radius:999px;background:rgba(255,255,255,.94);color:#0f172a;font:600 11px/1 system-ui,-apple-system,sans-serif;box-shadow:0 2px 8px rgba(15,23,42,.16);cursor:pointer}
.map-style-toggle:active{transform:scale(.96)}
.map-nav-banner{position:absolute;top:50px;left:10px;right:10px;z-index:6;display:none;align-items:center;gap:12px;padding:10px 14px;border-radius:16px;background:#0b1b3a;color:#fff;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 6px 18px rgba(2,6,23,.38)}
.map-nav-banner.show{display:flex}
.map-nav-arrow{flex:0 0 34px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:rgba(255,255,255,.14);font-size:18px}
.map-nav-copy{flex:1;min-width:0}
.map-nav-instruction{font:600 14px/1.2 system-ui,-apple-system,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.map-nav-meta{font:500 11px/1.2 system-ui,-apple-system,sans-serif;color:#c7d2fe;margin-top:3px}
.rider-nav-dot{position:relative;width:20px;height:20px;border-radius:50%;background:#2563eb;border:3.5px solid #fff;box-shadow:0 1px 5px rgba(2,6,23,.5)}
.rider-nav-dot::after{content:'';position:absolute;inset:-10px;border-radius:50%;border:2px solid rgba(37,99,235,.55);animation:riderPulse 2s ease-out infinite}
@keyframes riderPulse{0%{transform:scale(.35);opacity:.9}100%{transform:scale(1.45);opacity:0}}
.dest-pin{position:relative;width:26px;height:26px;border-radius:50% 50% 50% 0;background:#dc2626;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(2,6,23,.45)}
.dest-pin::after{content:'';position:absolute;top:7.5px;left:7.5px;width:8px;height:8px;border-radius:50%;background:#fff}
.stop-marker{position:relative;width:26px;height:26px;border-radius:50%;background:#0f766e;border:3px solid #fff;box-shadow:0 2px 6px rgba(2,6,23,.45);display:flex;align-items:center;justify-content:center;color:#fff;font:700 11px/1 system-ui,-apple-system,sans-serif}
.stop-marker.done{background:#94a3b8}
.stop-marker.current{background:#dc2626;box-shadow:0 0 0 4px rgba(220,38,38,.28),0 2px 6px rgba(2,6,23,.45)}
.stop-label{position:absolute;top:30px;left:50%;transform:translateX(-50%);max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:2px 7px;border-radius:9px;background:rgba(255,255,255,.95);border:1px solid rgba(15,23,42,.12);color:#0f172a;font:600 10px/1.3 system-ui,-apple-system,sans-serif;box-shadow:0 1px 4px rgba(15,23,42,.18)}
.stop-marker.current .stop-label{background:#dc2626;border-color:#dc2626;color:#fff}
.map-progress{position:absolute;left:10px;bottom:10px;z-index:6;display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:14px;background:rgba(11,27,58,.92);color:#fff;font:600 11px/1 system-ui,-apple-system,sans-serif;box-shadow:0 4px 14px rgba(2,6,23,.34)}
.map-progress .bar{position:relative;width:74px;height:6px;border-radius:3px;background:rgba(255,255,255,.25);overflow:hidden}
.map-progress .bar > i{position:absolute;inset:0 auto 0 0;border-radius:3px;background:#34d399}
</style>
</head><body><div id="map"></div>
<div class="map-progress" id="map-progress" style="display:none"><div class="bar"><i id="map-progress-fill" style="width:0%"></i></div><span id="map-progress-text"></span></div>
<div class="map-nav-banner" id="map-nav-banner"><div class="map-nav-arrow" id="map-nav-arrow">&#9650;</div><div class="map-nav-copy"><div class="map-nav-instruction" id="map-nav-instruction">Starting…</div><div class="map-nav-meta" id="map-nav-meta"></div></div></div>
<script src="https://api.mapbox.com/mapbox-gl-js/v3.29.0/mapbox-gl.js"></script><script>
mapboxgl.accessToken = '${token}';
var STYLES = { satellite: '${RIDER_MAP_STYLES.satellite}', streets: '${RIDER_MAP_STYLES.streets}' };
var currentStyle = '${initialStyle}';
var destination = [${destination.longitude}, ${destination.latitude}];
var destLabel = ${safeLabelJson};
var map = new mapboxgl.Map({ container: 'map', style: STYLES[currentStyle], center: destination, zoom: 15, attributionControl: true, language: 'en' });

var ROUTE_SOURCE = 'rider-route';
var ROUTE_CASING = 'rider-route-casing';
var ROUTE_LINE = 'rider-route-line';
var NAV_ZOOM = 16.5;
var NAV_PITCH = 58;

var ARROWS = {
  turn: { left: '&#8592;', right: '&#8594;', 'slight left': '&#8598;', 'slight right': '&#8599;', 'sharp left': '&#8601;', 'sharp right': '&#8600;', uturn: '&#8635;' },
  'off ramp': { left: '&#8598;', right: '&#8599;' },
  'on ramp': { left: '&#8598;', right: '&#8599;' },
  fork: { left: '&#8598;', right: '&#8599;' },
};

var riderMarker = null;
var mapLoaded = false;
var routeSourceAdded = false;
var pendingPoint = null;
var pendingNav = false;
var lastRiderPoint = null;
var fullCoords = [];
var steps = [];
var routeInFlight = false;
var lastRoutedAt = 0;
var navRequestSeq = 0;
var navActive = false;

var destEl = document.createElement('div');
destEl.className = 'dest-pin';
new mapboxgl.Marker({ element: destEl, anchor: 'bottom' })
  .setLngLat(destination)
  .setPopup(new mapboxgl.Popup({ offset: 18, closeButton: false }).setText(destLabel))
  .addTo(map);

// Ordered delivery stops: keep the pin label as a sequence hint while coloured
// by state (done / current / upcoming) so the rider can read the plan at a glance.
var STOP_STATE_LABEL = { done: 'Delivered', current: 'Current stop', upcoming: 'Upcoming stop' };
var routeStops = ${stopsJson};
var stopMarkers = [];
for (var si = 0; si < routeStops.length; si++) {
  (function (stop) {
    var el = document.createElement('div');
    el.className = 'stop-marker' + (stop.state === 'done' ? ' done' : stop.state === 'current' ? ' current' : '');
    el.textContent = String(stop.sequence || '');
    if (stop.label) {
      var nameEl = document.createElement('div');
      nameEl.className = 'stop-label';
      nameEl.textContent = stop.label;
      el.appendChild(nameEl);
    }
    var popupText = (stop.label ? stop.label + ' · ' : '') + (STOP_STATE_LABEL[stop.state] || 'Stop');
    stopMarkers.push(new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([stop.longitude, stop.latitude])
      .setPopup(new mapboxgl.Popup({ offset: 14, closeButton: false }).setText(popupText))
      .addTo(map));
  })(routeStops[si]);
}

// Mirror the run's progress bar on the map so the stop sheet keeps the same
// progress context the main screen shows without repeating the header stats.
window.setRouteProgress = function (done, total) {
  var box = document.getElementById('map-progress');
  if (!box) return;
  var safeTotal = total > 0 ? total : 1;
  var pct = Math.max(0, Math.min(100, Math.round((done / safeTotal) * 100)));
  var fill = document.getElementById('map-progress-fill');
  var text = document.getElementById('map-progress-text');
  if (fill) fill.style.width = pct + '%';
  if (text) text.textContent = done + ' / ' + safeTotal + ' delivered';
  box.style.display = 'flex';
};

function arrowForManeuver(maneuver) {
  if (!maneuver) return '&#9650;';
  var type = maneuver.type || '';
  var modifier = maneuver.modifier || '';
  if (type === 'arrive') return '&#9873;';
  if (type === 'depart') return '&#9650;';
  if (type === 'roundabout' || type === 'rotary') return '&#8635;';
  if (ARROWS[type] && ARROWS[type][modifier]) return ARROWS[type][modifier];
  if (modifier.indexOf('left') !== -1) return '&#8592;';
  if (modifier.indexOf('right') !== -1) return '&#8594;';
  return '&#9650;';
}

function setBanner(step, metaText) {
  var banner = document.getElementById('map-nav-banner');
  if (!banner) return;
  var arrow = document.getElementById('map-nav-arrow');
  var instruction = document.getElementById('map-nav-instruction');
  var meta = document.getElementById('map-nav-meta');
  if (arrow) arrow.innerHTML = arrowForManeuver(step && step.maneuver);
  if (instruction) instruction.textContent = step ? (step.instruction || 'Continue') : 'Continue';
  if (meta) meta.textContent = metaText || '';
}

function showBanner() { var b = document.getElementById('map-nav-banner'); if (b) b.classList.add('show'); }
function hideBanner() { var b = document.getElementById('map-nav-banner'); if (b) b.classList.remove('show'); }

function haversineMeters(a, b) {
  var R = 6371000;
  var dLat = (b[1] - a[1]) * Math.PI / 180;
  var dLon = (b[0] - a[0]) * Math.PI / 180;
  var lat1 = a[1] * Math.PI / 180;
  var lat2 = b[1] * Math.PI / 180;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function routeLength(coords) {
  var total = 0;
  for (var i = 0; i < coords.length - 1; i++) total += haversineMeters(coords[i], coords[i + 1]);
  return total;
}

function formatDistance(meters) {
  if (meters >= 1000) return (meters / 1000).toFixed(1) + ' km';
  return Math.max(0, Math.round(meters)) + ' m';
}

function stepsTotalMeters() {
  var t = 0;
  for (var i = 0; i < steps.length; i++) t += steps[i].distanceMeters || 0;
  return t;
}

// Snap the rider onto the route and split it into traversed / ahead geometry.
function splitAtRider(point) {
  if (!point || fullCoords.length < 2) return { done: [], alive: fullCoords.slice(), snapped: fullCoords[0] };
  var snapped = fullCoords[0];
  var bestIndex = 0;
  var bestDist = Infinity;
  for (var i = 0; i < fullCoords.length; i++) {
    var d = haversineMeters(point, fullCoords[i]);
    if (d < bestDist) { bestDist = d; bestIndex = i; snapped = fullCoords[i]; }
  }
  return { done: fullCoords.slice(0, bestIndex), alive: fullCoords.slice(bestIndex), snapped: snapped };
}

function routeGeoJSON(coords, complete) {
  return {
    type: 'Feature',
    properties: { complete: !!complete },
    geometry: { type: 'LineString', coordinates: coords },
  };
}

function ensureRouteLayers() {
  if (!mapLoaded || !map.isStyleLoaded() || fullCoords.length < 2) { pendingNav = true; return; }
  if (!routeSourceAdded) {
    try {
      map.addSource(ROUTE_SOURCE, { type: 'geojson', data: routeGeoJSON(fullCoords, false) });
      map.addLayer({ id: ROUTE_CASING, type: 'line', source: ROUTE_SOURCE, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0b2f7a', 'line-width': 13, 'line-opacity': 0.55 } });
      map.addLayer({ id: ROUTE_LINE, type: 'line', source: ROUTE_SOURCE, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2563eb', 'line-width': 8, 'line-opacity': 0.95 } });
      routeSourceAdded = true;
    } catch (e) { pendingNav = true; return; }
  }
  renderRouteProgress();
}

// Draw the highlighted "ahead" leg (rider -> destination only) so the blue line
// always runs from the rider to the next stop, never behind them.
function renderRouteProgress() {
  var source = map.getSource(ROUTE_SOURCE);
  if (!source || fullCoords.length < 2) return;
  var split = splitAtRider(lastRiderPoint);
  var drawn = split.alive.length >= 2 ? split.alive : fullCoords;
  source.setData(routeGeoJSON(drawn, false));
  updateBanner(split);
}

function updateBanner(splitOverride) {
  if (!steps.length) return;
  var split = splitOverride || splitAtRider(lastRiderPoint);
  var aheadMeters = routeLength(split.alive);
  var totalMeters = stepsTotalMeters();
  var travelled = Math.max(0, totalMeters - aheadMeters);
  var idx = 0;
  var acc = 0;
  for (var i = 0; i < steps.length; i++) {
    var stepLen = steps[i].distanceMeters || 0;
    if (acc + stepLen >= travelled) { idx = i; break; }
    acc += stepLen;
    idx = i;
  }
  var step = steps[idx] || steps[steps.length - 1];
  var toStep = Math.max(0, (acc + (step.distanceMeters || 0)) - travelled);
  var after = 0;
  for (var j = idx + 1; j < steps.length; j++) after += steps[j].distanceMeters || 0;
  var meta;
  if (toStep < 25 && idx < steps.length - 1) {
    meta = 'Then ' + (steps[idx + 1].instruction || 'continue');
  } else {
    meta = 'In ' + formatDistance(toStep) + (after > 0 ? ' · ' + formatDistance(toStep + after) + ' to go' : '');
  }
  setBanner(step, meta);
  showBanner();
}

function requestRoute() {
  if (!lastRiderPoint || !mapLoaded || !map.isStyleLoaded()) { pendingNav = true; return; }
  var now = Date.now();
  if (routeInFlight || now - lastRoutedAt < 6000) return;
  routeInFlight = true;
  lastRoutedAt = now;
  var seq = ++navRequestSeq;
  var url = 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic/'
    + lastRiderPoint[0] + ',' + lastRiderPoint[1] + ';' + destination[0] + ',' + destination[1]
    + '?geometries=geojson&overview=full&steps=true&access_token=' + mapboxgl.accessToken;
  fetch(url).then(function (r) { return r.json(); }).then(function (json) {
    if (seq !== navRequestSeq) { routeInFlight = false; return; }
    routeInFlight = false;
    if (!json || json.code !== 'Ok' || !json.routes || !json.routes.length) {
      if (fullCoords.length < 2) { fullCoords = [lastRiderPoint, destination]; steps = []; ensureRouteLayers(); }
      return;
    }
    var route = json.routes[0];
    fullCoords = route.geometry.coordinates;
    steps = [];
    var legs = route.legs || [];
    for (var i = 0; i < legs.length; i++) {
      var legSteps = legs[i].steps || [];
      for (var j = 0; j < legSteps.length; j++) {
        var s = legSteps[j];
        var maneuver = s.maneuver || {};
        steps.push({
          instruction: maneuver.instruction || (s.name ? 'Continue on ' + s.name : 'Continue'),
          distanceMeters: s.distance || 0,
          maneuver: maneuver,
        });
      }
    }
    ensureRouteLayers();
    if (navActive) fitNav(lastRiderPoint, destination);
    else fitOverview(lastRiderPoint, destination);
  }).catch(function () {
    routeInFlight = false;
    if (fullCoords.length < 2) { fullCoords = [lastRiderPoint, destination]; ensureRouteLayers(); }
  });
}

function bearingBetween(a, b) {
  var lon1 = a[0] * Math.PI / 180, lat1 = a[1] * Math.PI / 180;
  var lon2 = b[0] * Math.PI / 180, lat2 = b[1] * Math.PI / 180;
  var y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function fitOverview(point, dest) {
  var bounds = new mapboxgl.LngLatBounds();
  bounds.extend(point);
  bounds.extend(dest);
  for (var k = 0; k < routeStops.length; k++) bounds.extend([routeStops[k].longitude, routeStops[k].latitude]);
  try { map.fitBounds(bounds, { padding: { top: 56, bottom: 72, left: 48, right: 48 }, maxZoom: 16, duration: 500 }); } catch (e) {}
}

function fitNav(point, dest) {
  try { map.easeTo({ center: point, zoom: NAV_ZOOM, pitch: NAV_PITCH, bearing: bearingBetween(point, destination), duration: 700 }); } catch (e) {}
}

function applyRider(point) {
  lastRiderPoint = point;
  if (!riderMarker) {
    var el = document.createElement('div');
    el.className = 'rider-nav-dot';
    riderMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat(point)
      .setPopup(new mapboxgl.Popup({ offset: 12, closeButton: false }).setText('You are here'))
      .addTo(map);
  } else {
    riderMarker.setLngLat(point);
  }
  if (navActive) fitNav(point, destination);
  if (fullCoords.length) renderRouteProgress();
  requestRoute();
}

function removeRoute() {
  if (!map.isStyleLoaded()) return;
  if (map.getLayer(ROUTE_LINE)) map.removeLayer(ROUTE_LINE);
  if (map.getLayer(ROUTE_CASING)) map.removeLayer(ROUTE_CASING);
  if (map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE);
  routeSourceAdded = false;
}

window.setRiderLocation = function (lat, lng) {
  var point = [lng, lat];
  if (!mapLoaded || !map.isStyleLoaded()) { pendingPoint = point; return; }
  applyRider(point);
};

window.setNavigationMode = function (on) {
  navActive = !!on;
  if (!mapLoaded || !map.isStyleLoaded() || !lastRiderPoint) return;
  if (navActive) {
    fitNav(lastRiderPoint, destination);
    if (fullCoords.length) renderRouteProgress();
    requestRoute();
  } else {
    try { map.easeTo({ pitch: 0, bearing: 0, duration: 600 }); } catch (e) {}
    fitOverview(lastRiderPoint, destination);
    requestRoute();
  }
};

window.clearRiderLocation = function () {
  if (riderMarker) { riderMarker.remove(); riderMarker = null; }
  removeRoute();
  hideBanner();
  fullCoords = [];
  steps = [];
  pendingPoint = null;
  lastRiderPoint = null;
  pendingNav = false;
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
  // Prefer a location queued while the new style was loading so that update is
  // not dropped until the next GPS tick.
  if (pendingPoint) {
    var queued = pendingPoint;
    pendingPoint = null;
    applyRider(queued);
  } else if (fullCoords.length) {
    ensureRouteLayers();
  }
  if (navActive && lastRiderPoint) fitNav(lastRiderPoint, destination);
});

function flushPending() {
  if (mapLoaded) return true;
  if (map.getStyle() && map.isStyleLoaded()) {
    mapLoaded = true;
    map.resize();
    if (pendingPoint) { applyRider(pendingPoint); pendingPoint = null; }
    if (pendingNav) { pendingNav = false; requestRoute(); }
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