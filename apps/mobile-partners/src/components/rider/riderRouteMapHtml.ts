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
  /**
   * Used as the route origin until a live GPS fix arrives (and when the fix is
   * withdrawn). Riders start the run at the store, so a store-anchored line +
   * ETA is truthful for the first mile and re-routes from the real position as
   * soon as the watch delivers a fix. Without it a single-stop run with no GPS
   * renders no line at all (the preview needs two coordinates).
   */
  fallbackOrigin?: MapCoordinate | null;
};

export type RiderMapStop = {
  latitude: number;
  longitude: number;
  sequence: number;
  id?: string;
  label?: string;
  address?: string;
  plan?: string;
  status?: string;
  multiSub?: boolean;
  cashDuePaise?: number;
  /** Cash already collected against this stop's day (a partial or full payment). */
  cashPaidPaise?: number;
  /** Extra/add-on milk units attached to this stop, if any. */
  extraCount?: number;
  /** True when the day was skipped rather than delivered/failed. */
  skipped?: boolean;
  /** Delivery window for this stop (AM/PM), shown when it differs per stop. */
  slot?: string;
  parcelCount?: number;
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
        id: stop.id || '',
        latitude: Number(stop.latitude),
        longitude: Number(stop.longitude),
        sequence: Number(stop.sequence) || 0,
        label: stop.label || '',
        address: stop.address || '',
        plan: stop.plan || '',
        status: stop.status || '',
        multiSub: Boolean(stop.multiSub),
        cashDuePaise: Number(stop.cashDuePaise) || 0,
        cashPaidPaise: Number(stop.cashPaidPaise) || 0,
        extraCount: Number(stop.extraCount) || 0,
        skipped: Boolean(stop.skipped),
        slot: stop.slot || '',
        parcelCount: Number(stop.parcelCount) || 0,
        state: stop.state || 'upcoming',
      })),
  );
  const initialStyle: RiderMapStyleId = options.initialStyle && RIDER_MAP_STYLES[options.initialStyle] ? options.initialStyle : 'satellite';
  const fallbackOrigin = options.fallbackOrigin
    && Number.isFinite(options.fallbackOrigin.latitude)
    && Number.isFinite(options.fallbackOrigin.longitude)
    ? [Number(options.fallbackOrigin.longitude), Number(options.fallbackOrigin.latitude)]
    : null;
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
/* Google-Maps-style ETA chip: lives top-left (style toggle is top-right) and
   shows remaining time + distance for the road route whenever one is loaded. */
.map-eta{position:absolute;top:10px;left:10px;z-index:6;display:none;align-items:center;padding:8px 13px;border-radius:999px;background:#0b1b3a;color:#fff;font:700 13px/1 system-ui,-apple-system,sans-serif;letter-spacing:.2px;box-shadow:0 4px 14px rgba(2,6,23,.34)}
.map-eta.show{display:flex}
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
/* Status skins layered onto the circular marker so a stop reads without a tap. */
.stop-marker.delivered{background:#0f9d63}
.stop-marker.partial{background:#f59e0b}
.stop-marker.failed{background:#dc2626}
.stop-marker.no-pin{background:#0f766e}
/* The focused stop must always read red, so the .current skin is declared
   after every skin it could collide with (equal-specificity rules later in the
   sheet win), and the combined selectors below beat them on specificity. */
.stop-marker.current,.stop-marker.current.delivered,.stop-marker.current.partial,.stop-marker.current.failed,.stop-marker.current.no-pin,.stop-marker.current.skip{background:#dc2626;box-shadow:0 0 0 4px rgba(220,38,38,.28),0 2px 6px rgba(2,6,23,.45)}
.stop-label{position:absolute;top:30px;left:50%;transform:translateX(-50%);max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:2px 7px;border-radius:9px;background:rgba(255,255,255,.95);border:1px solid rgba(15,23,42,.12);color:#0f172a;font:600 10px/1.3 system-ui,-apple-system,sans-serif;box-shadow:0 1px 4px rgba(15,23,42,.18)}
.stop-marker.current .stop-label{background:#dc2626;border-color:#dc2626;color:#fff}
.stop-marker.active{box-shadow:0 0 0 5px rgba(37,99,235,.55),0 2px 6px rgba(2,6,23,.45);z-index:3;transform:scale(1.12)}
.stop-marker.extra-milk{box-shadow:0 0 0 3.5px rgba(59,130,246,.9),0 2px 6px rgba(2,6,23,.45)}
.stop-badges{position:absolute;top:29px;left:50%;transform:translateX(-50%);display:flex;gap:3px;align-items:center;white-space:nowrap}
.stop-badge{display:flex;align-items:center;gap:2px;padding:1px 5px;border-radius:8px;font:700 9px/1.5 system-ui,-apple-system,sans-serif;border:1px solid transparent;box-shadow:0 1px 3px rgba(15,23,42,.18)}
.stop-badge.paid{background:#e7f7ee;color:#075e45;border-color:#b7e4d7}
.stop-badge.partial{background:#fff3d6;color:#8a4b00;border-color:#f3d59b}
.stop-badge.skip{background:#eef2f6;color:#475569;border-color:#d5dde5}
.stop-badge.extra{background:#e7efff;color:#1d4ed8;border-color:#c2d4ff}
.map-legend{position:absolute;right:10px;bottom:12px;z-index:6;display:flex;flex-direction:column;gap:6px;padding:9px 11px;border-radius:14px;background:rgba(255,255,255,.95);border:1px solid rgba(15,23,42,.1);box-shadow:0 4px 14px rgba(2,6,23,.2);font:600 10px/1.3 system-ui,-apple-system,sans-serif;color:#334155}
.map-legend .legend-title{font:700 9px/1 system-ui,-apple-system,sans-serif;letter-spacing:1px;color:#0f766e;margin-bottom:2px}
.map-legend .legend-row{display:flex;align-items:center;gap:7px;white-space:nowrap}
.map-legend .legend-dot{width:11px;height:11px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(15,23,42,.18)}
.map-legend .legend-dot.delivered{background:#0f9d63}
.map-legend .legend-dot.partial{background:#f59e0b}
.map-legend .legend-dot.pending{background:#0f766e}
.map-legend .legend-dot.skip{background:#94a3b8}
.map-legend .legend-dot.extra{background:#3b82f6}
.mapboxgl-popup-content{border-radius:12px;padding:9px 11px;font:500 11px/1.45 system-ui,-apple-system,sans-serif;box-shadow:0 6px 18px rgba(2,6,23,.24)}
.mapboxgl-popup-content b{font-weight:700}
.map-progress{position:absolute;left:10px;bottom:10px;z-index:6;display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:14px;background:rgba(11,27,58,.92);color:#fff;font:600 11px/1 system-ui,-apple-system,sans-serif;box-shadow:0 4px 14px rgba(2,6,23,.34)}
.map-progress .bar{position:relative;width:74px;height:6px;border-radius:3px;background:rgba(255,255,255,.25);overflow:hidden}
.map-progress .bar > i{position:absolute;inset:0 auto 0 0;border-radius:3px;background:#34d399}
</style>
</head><body><div id="map"></div>
<div class="map-progress" id="map-progress" style="display:none"><div class="bar"><i id="map-progress-fill" style="width:0%"></i></div><span id="map-progress-text"></span></div>
<div class="map-eta" id="map-eta"></div>
<div class="map-legend" id="map-legend">
  <div class="legend-title">STOP KEY</div>
  <div class="legend-row"><span class="legend-dot pending"></span>To deliver</div>
  <div class="legend-row"><span class="legend-dot delivered"></span>Delivered</div>
  <div class="legend-row"><span class="legend-dot partial"></span>Part-paid</div>
  <div class="legend-row"><span class="legend-dot skip"></span>Skipped</div>
  <div class="legend-row"><span class="legend-dot extra"></span>Extra milk</div>
</div>
<div class="map-nav-banner" id="map-nav-banner"><div class="map-nav-arrow" id="map-nav-arrow">&#9650;</div><div class="map-nav-copy"><div class="map-nav-instruction" id="map-nav-instruction">Starting…</div><div class="map-nav-meta" id="map-nav-meta"></div></div></div>
<script src="https://api.mapbox.com/mapbox-gl-js/v3.29.0/mapbox-gl.js"></script><script>
mapboxgl.accessToken = '${token}';
var STYLES = { satellite: '${RIDER_MAP_STYLES.satellite}', streets: '${RIDER_MAP_STYLES.streets}' };
var currentStyle = '${initialStyle}';
var destination = [${destination.longitude}, ${destination.latitude}];
var fallbackOrigin = ${JSON.stringify(fallbackOrigin)};
var destLabel = ${safeLabelJson};
var map = new mapboxgl.Map({ container: 'map', style: STYLES[currentStyle], center: destination, zoom: 15, attributionControl: true, language: 'en' });

var ROUTE_SOURCE = 'rider-route';
var ROUTE_CASING = 'rider-route-casing';
var ROUTE_LINE = 'rider-route-line';
// Faint blue "route ahead" line: rider -> upcoming stops in sequence. It draws
// immediately (no directions call) so there is always a visible blue line
// towards the customers, even before the road-following route arrives or when
// GPS/directions are unavailable.
var PREVIEW_SOURCE = 'rider-stops-preview';
var PREVIEW_LINE = 'rider-stops-preview-line';
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
var previewSourceAdded = false;
var pendingPoint = null;
var pendingNav = false;
var lastRiderPoint = null;
var fullCoords = [];
var steps = [];
var routeInFlight = false;
var lastRoutedAt = 0;
var navRequestSeq = 0;
var navActive = false;
var routeEtaSeconds = 0;
var routeEtaMeters = 0;

// Route origin: the live rider fix when we have one, otherwise the store the
// run starts from, so there is always a blue line + ETA towards the customer.
function routeOrigin() {
  return lastRiderPoint || fallbackOrigin;
}

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

function postToRN(message) {
  try {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage(JSON.stringify(message), '*');
    }
  } catch (e) {}
}

// Customer-controlled fields (name, address, plan) are rendered as HTML in the
// popup via setHTML, so escape them first: an unescaped tag or attribute in a
// name would otherwise run script inside the rider WebView.
function esc(v) {
  return String(v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function stopPopupHtml(stop) {
  var bits = [];
  if (stop.label) bits.push('<b>' + esc(stop.label) + '</b>');
  if (stop.plan) bits.push(esc(stop.plan));
  if (stop.address) bits.push(esc(stop.address));
  if (stop.multiSub) bits.push('2 subscriptions');
  var paid = Number(stop.cashPaidPaise) || 0;
  var due = Number(stop.cashDuePaise) || 0;
  if (due > 0) {
    if (paid > 0) bits.push('Collected ₹' + (paid / 100).toFixed(0) + ' of ₹' + (due / 100).toFixed(0));
    else bits.push('Collect ₹' + (due / 100).toFixed(0));
  } else if (paid > 0) {
    bits.push('Collected ₹' + (paid / 100).toFixed(0));
  } else {
    bits.push('Prepaid');
  }
  if (Number(stop.extraCount) > 0) bits.push('+' + stop.extraCount + 'L extra milk');
  if (stop.slot) bits.push(stop.slot + ' slot');
  bits.push(stop.skipped ? 'Skipped' : (STOP_STATE_LABEL[stop.state] || 'Stop'));
  return bits.join('<br/>');
}

// Two-letter status ring + compact signal badges under the pin, so a stop shows
// what happened to it (delivered / part-paid / skipped / extra) at a glance.
function markerClassFor(stop) {
  var cls = 'stop-marker';
  if (stop.skipped) cls += ' skip';
  else if (stop.status === 'DELIVERED' || stop.status === 'COMPLETED' || stop.state === 'done') cls += ' delivered';
  else if (stop.status === 'FAILED' || stop.status === 'RETURNED') cls += ' failed';
  else if (Number(stop.cashPaidPaise) > 0 && Number(stop.cashDuePaise) > Number(stop.cashPaidPaise)) cls += ' partial';
  else cls += ' no-pin';
  if (stop.state === 'current') cls += ' current';
  if (Number(stop.extraCount) > 0) cls += ' extra-milk';
  return cls;
}

function badgesFor(stop) {
  var badges = [];
  var paid = Number(stop.cashPaidPaise) || 0;
  var due = Number(stop.cashDuePaise) || 0;
  var fullyPaid = (paid > 0 && paid >= due) || (due > 0 && paid >= due);
  if (fullyPaid) badges.push('<span class="stop-badge paid">&#8377;' + (paid / 100).toFixed(0) + '</span>');
  else if (paid > 0) badges.push('<span class="stop-badge partial">&#8377;' + (paid / 100).toFixed(0) + '</span>');
  else if (stop.status === 'DELIVERED' && due <= 0) badges.push('<span class="stop-badge paid">paid</span>');
  if (stop.skipped) badges.push('<span class="stop-badge skip">skip</span>');
  if (Number(stop.extraCount) > 0) badges.push('<span class="stop-badge extra">+' + stop.extraCount + 'L</span>');
  return badges.length ? badges.join('') : '';
}

for (var si = 0; si < routeStops.length; si++) {
  (function (stop) {
    var el = document.createElement('div');
    el.className = markerClassFor(stop);
    el.setAttribute('data-seq', String(stop.sequence || ''));
    if (stop.id) el.setAttribute('data-id', stop.id);
    if (stop.status) el.setAttribute('data-status', stop.status);
    el.textContent = String(stop.sequence || '');
    var badgeHtml = badgesFor(stop);
    if (badgeHtml) {
      var badgeWrap = document.createElement('div');
      badgeWrap.className = 'stop-badges';
      badgeWrap.innerHTML = badgeHtml;
      el.appendChild(badgeWrap);
    }
    if (stop.label) {
      var nameEl = document.createElement('div');
      nameEl.className = 'stop-label';
      nameEl.textContent = stop.label;
      el.appendChild(nameEl);
    }
    el.addEventListener('click', function (event) {
      if (event && event.stopPropagation) event.stopPropagation();
      postToRN({ type: 'stop-tap', id: stop.id, sequence: stop.sequence });
    });
    var marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([stop.longitude, stop.latitude])
      .setPopup(new mapboxgl.Popup({ offset: 14, closeButton: false }).setHTML(stopPopupHtml(stop)))
      .addTo(map);
    stopMarkers.push({ id: stop.id, sequence: stop.sequence, el: el, marker: marker });
  })(routeStops[si]);
}

// The key is only meaningful when there is more than one stop to tell apart.
(function () {
  var legend = document.getElementById('map-legend');
  if (legend && routeStops.length < 2) legend.style.display = 'none';
})();

// Highlight one stop as the focused/current pin. The native app drives this as
// the rider moves the bottom sheet, so the map and the sheet never disagree.
window.setActiveStop = function (id) {
  for (var k = 0; k < stopMarkers.length; k++) {
    var entry = stopMarkers[k];
    if (!entry || !entry.el) continue;
    var isActive = String(entry.id) === String(id);
    entry.el.classList.toggle('active', isActive);
    entry.el.classList.toggle('current', isActive);
    if (isActive) {
      try { map.easeTo({ center: [entry.marker.getLngLat().lng, entry.marker.getLngLat().lat], zoom: Math.max(map.getZoom(), 14.5), duration: 600 }); } catch (e) {}
    }
  }
};

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

function formatEta(seconds) {
  var mins = Math.max(1, Math.round(seconds / 60));
  if (mins >= 60) return Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min';
  return mins + ' min';
}

// Remaining time + distance chip: scales the live directions duration/distance
// by how much of the route is still ahead of the rider. Hidden until a road
// route exists (a straight-line preview has no trustworthy duration).
function updateEtaChip(splitOverride) {
  var chip = document.getElementById('map-eta');
  if (!chip) return;
  if (!routeEtaSeconds || !fullCoords.length) { chip.classList.remove('show'); chip.textContent = ''; return; }
  var split = splitOverride || splitAtRider(lastRiderPoint);
  var totalMeters = stepsTotalMeters() || routeEtaMeters || routeLength(fullCoords);
  var aheadMeters = routeLength(split.alive.length >= 2 ? split.alive : fullCoords);
  var ratio = totalMeters > 0 ? Math.max(0, Math.min(1, aheadMeters / totalMeters)) : 1;
  chip.textContent = '≈ ' + formatEta(routeEtaSeconds * ratio) + ' · ' + formatDistance(totalMeters * ratio);
  chip.classList.add('show');
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
  if (!mapLoaded || fullCoords.length < 2) { pendingNav = true; return; }
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
  updateEtaChip(split);
}

// Upcoming stops in route order (done/skipped ones drop out), prefixed with the
// rider when a fix exists. Identical consecutive points are collapsed so an
// arrived-at stop does not produce a zero-length segment.
function previewCoords() {
  var upcoming = [];
  for (var i = 0; i < routeStops.length; i++) {
    var s = routeStops[i];
    if (s.skipped) continue;
    if (s.status === 'DELIVERED' || s.status === 'COMPLETED' || s.status === 'CANCELLED' || s.status === 'FAILED' || s.status === 'RETURNED') continue;
    upcoming.push(s);
  }
  upcoming.sort(function (a, b) { return (a.sequence || 0) - (b.sequence || 0); });
  var coords = [];
  var origin = routeOrigin();
  if (origin) coords.push(origin);
  for (var k = 0; k < upcoming.length; k++) {
    var p = [upcoming[k].longitude, upcoming[k].latitude];
    var last = coords[coords.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 1e-7 || Math.abs(last[1] - p[1]) > 1e-7) coords.push(p);
  }
  return coords;
}

function renderPreviewLine() {
  if (!mapLoaded) return;
  var coords = previewCoords();
  if (coords.length < 2) { coords = []; }
  if (!previewSourceAdded) {
    try {
      map.addSource(PREVIEW_SOURCE, { type: 'geojson', data: routeGeoJSON(coords, false) });
      map.addLayer({ id: PREVIEW_LINE, type: 'line', source: PREVIEW_SOURCE, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2563eb', 'line-width': 5, 'line-opacity': 0.55, 'line-dasharray': [1.4, 1.4] } });
      previewSourceAdded = true;
    } catch (e) { return; }
  }
  var source = map.getSource(PREVIEW_SOURCE);
  if (source) source.setData(routeGeoJSON(coords, false));
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
  var from = routeOrigin();
  if (!from || !mapLoaded) { pendingNav = true; return; }
  var now = Date.now();
  if (routeInFlight || now - lastRoutedAt < 6000) return;
  routeInFlight = true;
  lastRoutedAt = now;
  var seq = ++navRequestSeq;
  var url = 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic/'
    + from[0] + ',' + from[1] + ';' + destination[0] + ',' + destination[1]
    + '?geometries=geojson&overview=full&steps=true&access_token=' + mapboxgl.accessToken;
  fetch(url).then(function (r) { return r.json(); }).then(function (json) {
    if (seq !== navRequestSeq) { routeInFlight = false; return; }
    routeInFlight = false;
    if (!json || json.code !== 'Ok' || !json.routes || !json.routes.length) {
      routeEtaSeconds = 0;
      routeEtaMeters = 0;
      updateEtaChip(null);
      if (fullCoords.length < 2) { fullCoords = [from, destination]; steps = []; ensureRouteLayers(); }
      return;
    }
    var route = json.routes[0];
    fullCoords = route.geometry.coordinates;
    routeEtaSeconds = Number(route.duration) || 0;
    routeEtaMeters = Number(route.distance) || routeLength(fullCoords);
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
    updateEtaChip(null);
    if (navActive) fitNav(from, destination);
    else fitOverview(from, destination);
  }).catch(function () {
    routeInFlight = false;
    routeEtaSeconds = 0;
    routeEtaMeters = 0;
    updateEtaChip(null);
    if (fullCoords.length < 2) { fullCoords = [from, destination]; ensureRouteLayers(); }
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
  renderPreviewLine();
  requestRoute();
}

function removeRoute() {
  try {
    if (map.getLayer(ROUTE_LINE)) map.removeLayer(ROUTE_LINE);
    if (map.getLayer(ROUTE_CASING)) map.removeLayer(ROUTE_CASING);
    if (map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE);
    routeSourceAdded = false;
    if (map.getLayer(PREVIEW_LINE)) map.removeLayer(PREVIEW_LINE);
    if (map.getSource(PREVIEW_SOURCE)) map.removeSource(PREVIEW_SOURCE);
    previewSourceAdded = false;
  } catch (e) {}
}

window.setRiderLocation = function (lat, lng) {
  var point = [lng, lat];
  if (!mapLoaded) { pendingPoint = point; return; }
  applyRider(point);
};

window.setNavigationMode = function (on) {
  navActive = !!on;
  var from = routeOrigin();
  if (!mapLoaded || !from) return;
  if (navActive) {
    fitNav(from, destination);
    if (fullCoords.length) renderRouteProgress();
    requestRoute();
  } else {
    try { map.easeTo({ pitch: 0, bearing: 0, duration: 600 }); } catch (e) {}
    fitOverview(from, destination);
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
  // Keep the route alive on the store fallback origin: the line towards the
  // customer must not vanish just because the GPS fix was withdrawn.
  renderPreviewLine();
  lastRoutedAt = 0;
  requestRoute();
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
  previewSourceAdded = false;
  // Prefer a location queued while the new style was loading so that update is
  // not dropped until the next GPS tick.
  if (pendingPoint) {
    var queued = pendingPoint;
    pendingPoint = null;
    applyRider(queued);
  } else {
    if (fullCoords.length) ensureRouteLayers();
    renderPreviewLine();
  }
  if (navActive && lastRiderPoint) fitNav(lastRiderPoint, destination);
});

function markReady() {
  if (mapLoaded) return;
  mapLoaded = true;
  map.resize();
  // The route-ahead line needs no GPS: draw it as soon as the map is usable
  // so the blue line towards the customers is there from the first frame.
  renderPreviewLine();
  if (pendingPoint) { applyRider(pendingPoint); pendingPoint = null; }
  // Fetch the road route (and ETA chip) from the rider fix or the store
  // fallback origin — not only after the first GPS tick.
  if (pendingNav) { pendingNav = false; }
  requestRoute();
}

// Satellite-streets (and other composite styles) can paint tiles and markers
// fine while the style-loaded flag never flips to true — a known Mapbox GL
// quirk often tied to the language option or a slow glyph/sprite fetch. The
// old code gated the entire route + preview + ETA chain on that flag, so the
// blue line silently never drew. Trust the load/idle events instead, and
// force-ready after a bounded poll as a last resort.
map.on('load', markReady);
map.on('idle', markReady);

// Safety net: some WebViews never fire load/idle reliably. After ~10s of
// polling, flip ready anyway — by then the style is certainly loaded even if
// the events were missed (addSource/addLayer below are try/catch-guarded).
var flushTries = 0;
var flushTimer = setInterval(function () {
  if (!mapLoaded && ++flushTries > 25) markReady();
  if (mapLoaded) clearInterval(flushTimer);
}, 400);
</script></body></html>`;
};