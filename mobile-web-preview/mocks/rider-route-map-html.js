/* Preview-only mock for `apps/mobile-partners/src/components/rider/riderRouteMapHtml`.
 *
 * The real builder emits a Mapbox GL page. The sandbox has no valid Mapbox
 * public token (only `pk.test-dummy...`), and Mapbox GL never fires `load` with
 * an invalid token, so the WebView stays blank. This module emits a
 * token-free SVG "map" that implements the exact same window API the real
 * page does (`setRiderLocation`, `setNavigationMode`, `setRouteProgress`,
 * `setRiderMapStyle`, `clearRiderLocation`), so the *real* RiderRouteMap
 * component and the real screen wiring can be exercised in the browser:
 *
 *   - numbered stop pins coloured by state (done / current / upcoming) + label
 *   - a dashed line through the planned stop sequence
 *   - a solid blue line from the rider dot to the destination (the "blue route")
 *   - a pulsing rider dot
 *
 * It is wired in only by webpack.config.js (resolve.alias), never bundled by the
 * native app.
 */
export const RIDER_MAP_STYLES = { satellite: 'satellite', streets: 'streets' };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function buildRiderMapHtml(destination, label, _token, options = {}) {
  const stops = (options.stops || [])
    .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
    .map((s) => ({
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
      sequence: Number(s.sequence) || 0,
      label: s.label || '',
      state: s.state || 'upcoming',
    }));
  const dest = { latitude: Number(destination.latitude), longitude: Number(destination.longitude) };

  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<style>
html,body,#wrap{height:100%;margin:0;overflow:hidden;background:#0b1f17;font-family:system-ui,-apple-system,sans-serif}
#wrap{position:relative}
#map{position:absolute;inset:0}
.map-nav-banner{position:absolute;top:10px;left:10px;right:10px;z-index:6;display:none;align-items:center;gap:12px;padding:10px 14px;border-radius:16px;background:#0b1b3a;color:#fff;box-shadow:0 6px 18px rgba(2,6,23,.38)}
.map-nav-banner.show{display:flex}
.map-nav-arrow{flex:0 0 34px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:rgba(255,255,255,.14);font-size:18px}
.map-nav-instruction{font-weight:600;font-size:14px}
.map-nav-meta{font-size:11px;color:#c7d2fe;margin-top:3px}
.map-progress{position:absolute;left:10px;bottom:10px;z-index:6;display:none;align-items:center;gap:8px;padding:8px 12px;border-radius:14px;background:rgba(11,27,58,.92);color:#fff;font-weight:600;font-size:11px}
.map-progress .bar{position:relative;width:74px;height:6px;border-radius:3px;background:rgba(255,255,255,.25);overflow:hidden}
.map-progress .bar > i{position:absolute;inset:0 auto 0 0;border-radius:3px;background:#34d399;width:0%}
.pin-pulse{transform-origin:center}
@keyframes riderPulse{0%{transform:scale(.55);opacity:.9}100%{transform:scale(2.4);opacity:0}}
.pulse{animation:riderPulse 2s ease-out infinite;transform-box:fill-box;transform-origin:center}
.map-style-toggle{position:absolute;top:10px;right:10px;z-index:7;height:28px;padding:0 12px;border:1px solid rgba(15,23,42,.12);border-radius:999px;background:rgba(255,255,255,.94);color:#0f172a;font-weight:600;font-size:11px;box-shadow:0 2px 8px rgba(15,23,42,.16);cursor:pointer}
</style></head>
<body><div id="wrap">
<div id="map"><svg id="svg" width="100%" height="100%"></svg></div>
<div class="map-nav-banner" id="map-nav-banner"><div class="map-nav-arrow">&#9650;</div><div><div class="map-nav-instruction" id="nav-instruction">${esc(label)}</div><div class="map-nav-meta" id="nav-meta"></div></div></div>
<div class="map-progress" id="map-progress"><div class="bar"><i id="progress-fill"></i></div><span id="progress-text"></span></div>
<button class="map-style-toggle" id="style-toggle">Satellite</button>
</div>
<script>
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
var STOPS = ${JSON.stringify(stops)};
var DEST = ${JSON.stringify(dest)};
var DEST_LABEL = ${JSON.stringify(label)};
var rider = null;
var nav = false;
var progress = { done: 0, total: 0 };
var styleId = 'satellite';

var PALETTE = {
  satellite: { bg: '#0d2a20', grid: 'rgba(120,180,150,.14)', road: 'rgba(190,210,200,.22)' },
  streets: { bg: '#eef2f0', grid: 'rgba(15,60,45,.10)', road: 'rgba(15,60,45,.18)' },
};

function points() {
  var p = STOPS.map(function (s) { return { lat: s.latitude, lng: s.longitude }; });
  p.push({ lat: DEST.latitude, lng: DEST.longitude });
  if (rider) p.push({ lat: rider.lat, lng: rider.lng });
  return p;
}

function viewport() {
  var svg = document.getElementById('svg');
  var W = svg.clientWidth || 360, H = svg.clientHeight || 240;
  var pts = points();
  var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  pts.forEach(function (q) { minLat = Math.min(minLat, q.lat); maxLat = Math.max(maxLat, q.lat); minLng = Math.min(minLng, q.lng); maxLng = Math.max(maxLng, q.lng); });
  var pad = 46;
  var spanLat = Math.max(maxLat - minLat, 0.0008), spanLng = Math.max(maxLng - minLng, 0.0008);
  var sx = (W - pad * 2) / spanLng, sy = (H - pad * 2) / spanLat;
  var scale = Math.min(sx, sy);
  var offX = (W - spanLng * scale) / 2, offY = (H - spanLat * scale) / 2;
  return {
    W: W, H: H,
    to: function (lat, lng) {
      return [offX + (lng - minLng) * scale, offY + (maxLat - lat) * scale];
    },
  };
}

function polyline(vp, pts, color, width, dash) {
  if (pts.length < 2) return '';
  var d = pts.map(function (p) { var xy = vp.to(p[0], p[1]); return xy[0].toFixed(1) + ',' + xy[1].toFixed(1); }).join(' ');
  return '<polyline points="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + width + '" stroke-linecap="round" stroke-linejoin="round"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' />';
}

function render() {
  var svg = document.getElementById('svg');
  var pal = PALETTE[styleId] || PALETTE.satellite;
  var vp = viewport();
  var parts = [];

  // background + faux street grid (a stand-in for tiles)
  parts.push('<rect x="0" y="0" width="' + vp.W + '" height="' + vp.H + '" fill="' + pal.bg + '"/>');
  for (var gx = 0; gx < vp.W; gx += 40) parts.push('<line x1="' + gx + '" y1="0" x2="' + gx + '" y2="' + vp.H + '" stroke="' + pal.grid + '" stroke-width="1"/>');
  for (var gy = 0; gy < vp.H; gy += 40) parts.push('<line x1="0" y1="' + gy + '" x2="' + vp.W + '" y2="' + gy + '" stroke="' + pal.grid + '" stroke-width="1"/>');
  parts.push('<path d="M0 ' + (vp.H * 0.62) + ' Q ' + (vp.W * 0.5) + ' ' + (vp.H * 0.48) + ' ' + vp.W + ' ' + (vp.H * 0.58) + '" fill="none" stroke="' + pal.road + '" stroke-width="14" stroke-linecap="round"/>');

  // planned sequence line (dashed grey)
  var seq = STOPS.slice().sort(function (a, b) { return a.sequence - b.sequence; });
  var seqPts = seq.map(function (s) { return [s.latitude, s.longitude]; });
  parts.push(polyline(vp, seqPts, 'rgba(148,163,184,.75)', 3, '6 6'));

  // BLUE route: rider -> destination
  if (rider) parts.push(polyline(vp, [[rider.lat, rider.lng], [DEST.latitude, DEST.longitude]], '#2563eb', 7));

  // stop pins
  seq.forEach(function (s) {
    var xy = vp.to(s.latitude, s.longitude);
    var color = s.state === 'done' ? '#94a3b8' : s.state === 'current' ? '#dc2626' : '#0f766e';
    parts.push('<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="13" fill="' + color + '" stroke="#fff" stroke-width="3"/>');
    parts.push('<text x="' + xy[0] + '" y="' + (xy[1] + 4) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">' + esc(s.sequence) + '</text>');
    if (s.label) {
      parts.push('<text x="' + xy[0] + '" y="' + (xy[1] + 26) + '" text-anchor="middle" font-size="10" font-weight="600" fill="' + (s.state === 'current' ? '#dc2626' : '#e5eef0') + '" stroke="rgba(0,0,0,.45)" stroke-width="3" paint-order="stroke">' + esc(s.label) + '</text>');
    }
  });

  // destination pin
  var dxy = vp.to(DEST.latitude, DEST.longitude);
  parts.push('<circle cx="' + dxy[0] + '" cy="' + dxy[1] + '" r="7" fill="#dc2626" stroke="#fff" stroke-width="3"/>');

  // rider dot + pulse
  if (rider) {
    var rxy = vp.to(rider.lat, rider.lng);
    parts.push('<circle class="pulse" cx="' + rxy[0] + '" cy="' + rxy[1] + '" r="12" fill="none" stroke="rgba(37,99,235,.55)" stroke-width="2"/>');
    parts.push('<circle cx="' + rxy[0] + '" cy="' + rxy[1] + '" r="9" fill="#2563eb" stroke="#fff" stroke-width="3.5"/>');
  }
  svg.setAttribute('viewBox', '0 0 ' + vp.W + ' ' + vp.H);
  svg.innerHTML = parts.join('');
}

window.setRiderLocation = function (lat, lng) {
  rider = { lat: Number(lat), lng: Number(lng) };
  render();
};
window.clearRiderLocation = function () { rider = null; render(); };
window.setNavigationMode = function (on) {
  nav = !!on;
  var banner = document.getElementById('map-nav-banner');
  if (banner) banner.classList.toggle('show', nav);
  if (nav) { document.getElementById('nav-meta').textContent = 'Route active · ' + DEST_LABEL; }
};
window.setRouteProgress = function (done, total) {
  progress = { done: Number(done) || 0, total: Number(total) || 0 };
  var box = document.getElementById('map-progress');
  if (!box || !progress.total) return;
  box.style.display = 'flex';
  var pct = Math.round((Math.min(progress.done, progress.total) / progress.total) * 100);
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-text').textContent = progress.done + ' / ' + progress.total + ' delivered';
};
window.setRiderMapStyle = function (id) {
  styleId = PALETTE[id] ? id : 'satellite';
  render();
};
document.getElementById('style-toggle').addEventListener('click', function () {
  styleId = styleId === 'satellite' ? 'streets' : 'satellite';
  document.getElementById('style-toggle').textContent = styleId === 'satellite' ? 'Satellite' : 'Streets';
  render();
});
window.addEventListener('resize', render);
render();
</script></body></html>`;
}
