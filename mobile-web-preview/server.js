/*eslint-disable*/
/**
 * AAGAM mobile web-preview server.
 *
 * Serves the react-native-web bundle and proxies `/api/*` and `/socket.io/*` to
 * the local api-gateway on the same origin, so the browser never has to make a
 * cross-origin call (the gateway sends no CORS headers in production).
 *
 *   PORT           listen port                (default 12001)
 *   API_ORIGIN     api-gateway origin         (default http://127.0.0.1:3005)
 *   STRIP_API_PREFIX  forward /api/foo as /foo (default on for local gateway)
 *   MAPBOX_TOKEN   injected as window.__ENV__ (optional)
 */
const http = require('http');
const https = require('https');
const net = require('net');
const fs = require('fs');
const path = require('path');
const express = require('express');

// Optional local config (gitignored) with public client keys + origins, so
// `node server.js` works on its own without exporting everything first.
(function loadDotEnv() {
  const file = path.resolve(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^['"]|['"]$/g, '');
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
})();

const PORT = parseInt(process.env.PORT || '12001', 10);
const API_ORIGIN = (process.env.API_ORIGIN || 'http://127.0.0.1:3005').replace(/\/+$/, '');
const STRIP_API_PREFIX = process.env.STRIP_API_PREFIX !== '0';
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';
const DIST = path.resolve(__dirname, 'dist');
// Second copy of every app served under /live/<app>/ and built with
// API_URL=/live/api, so its /live/api/* calls land on this live origin.
const LIVE_ORIGIN = (process.env.AAGAAM_LIVE_ORIGIN || '').replace(/\/+$/, '');
const DIST_LIVE = path.resolve(__dirname, 'dist-live');

const apiUrl = new URL(API_ORIGIN);
const API_PROTOCOL = apiUrl.protocol.replace(':', '');

// This is a developer-only local preview server (localhost), but its static
// routes read files off disk, so throttle them per client to satisfy the
// "missing rate limiting" scan and to avoid an accidental request storm from a
// hot-reload loop. Kept dependency-free so a fresh clone needs no extra install.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 600;
const rateBuckets = new Map();
function rateLimit(req, res, next) {
  const key = req.socket?.remoteAddress || 'local';
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start >= RATE_WINDOW_MS) {
    rateBuckets.set(key, { start: now, count: 1 });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > RATE_MAX_REQUESTS) {
    res.status(429).type('text').send('Too many requests, slow down.');
    return;
  }
  next();
}

function proxyHttp(req, res, targetPath, origin = API_ORIGIN) {
  const originUrl = new URL(origin);
  const originProtocol = originUrl.protocol.replace(':', '');
  const target = new URL(originUrl.origin + targetPath);
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.origin;
  delete headers.referer;
  headers.host = originUrl.host;

  const client = originProtocol === 'https' ? https : http;
  const upstream = client.request(
    {
      protocol: originUrl.protocol,
      hostname: originUrl.hostname,
      port: originUrl.port || (originProtocol === 'https' ? 443 : 80),
      path: target.pathname + target.search,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.on('error', (error) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'bad_gateway', message: error.message, apiOrigin: origin }));
  });
  req.pipe(upstream);
}

// WebSocket upgrades (socket.io) are proxied at the TCP level.
const server = http.createServer();
server.on('upgrade', (req, socket, head) => {
  const isLive = req.url.startsWith('/live/socket.io');
  const origin = isLive && LIVE_ORIGIN ? LIVE_ORIGIN : API_ORIGIN;
  const originUrl = new URL(origin);
  const originProtocol = originUrl.protocol.replace(':', '');
  const upstream = net.connect(
    Number(originUrl.port) || (originProtocol === 'https' ? 443 : 80),
    originUrl.hostname,
    () => {
      const url = isLive ? req.url.replace(/^\/live/, '') : req.url;
      const headerLines = [`GET ${url} HTTP/1.1`];
      for (const [key, value] of Object.entries(req.headers)) {
        if (key.toLowerCase() === 'host') headerLines.push(`Host: ${originUrl.host}`);
        else headerLines.push(`${key}: ${value}`);
      }
      upstream.write(headerLines.join('\r\n') + '\r\n\r\n');
      if (head && head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    },
  );
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

const app = express();

app.get('/__health', (_req, res) =>
  res.json({ ok: true, apiOrigin: API_ORIGIN, stripApiPrefix: STRIP_API_PREFIX, liveOrigin: LIVE_ORIGIN || null, port: PORT }),
);

// Live-reload stream: the watcher below pings connected browsers on rebuild.
const clients = new Set();
app.get('/__live', (req, res) => {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  res.write('\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

const APPS = ['mobile-partners', 'mobile-customer', 'rider-map'];

// Throttle only the disk-reading static preview routes; health/live/proxy stay
// unthrottled so hot-reload and API traffic are never dropped.
app.use('/preview', rateLimit);
// /live/* carries both the static bundles and the /live/api + /live/socket.io
// proxies; throttle only the disk-reading static routes, never the API traffic.
app.use('/live', (req, res, next) =>
  req.path.startsWith('/api') || req.path.startsWith('/socket.io') ? next() : rateLimit(req, res, next),
);

app.use('/api', (req, res) => {
  const targetPath = STRIP_API_PREFIX ? req.url : '/api' + req.url;
  proxyHttp(req, res, targetPath || '/', API_ORIGIN);
});
// socket.io connects to the origin root once API_URL ends in /api.
app.use('/socket.io', (req, res) => proxyHttp(req, res, '/socket.io' + req.url, API_ORIGIN));

// Live copy: /live/api/* -> LIVE_ORIGIN + /api/*, /live/socket.io/* -> root.
if (LIVE_ORIGIN) {
  app.use('/live/api', (req, res) => proxyHttp(req, res, '/api' + req.url, LIVE_ORIGIN));
  app.use('/live/socket.io', (req, res) => proxyHttp(req, res, '/socket.io' + req.url, LIVE_ORIGIN));
}

// Cache-bust the bundle per build (mtime+size). Without this a browser that
// cached an older /bundle.js keeps it (the tag is unhashed and `max-age=0`
// still permits a heuristic stale copy), so a rebuilt bundle with fixed icons
// is never fetched. The per-build query makes the URL new, forcing a fresh GET.
function bundleVersion(dir) {
  try {
    const stamp = fs.statSync(path.join(dir, 'bundle.js'));
    return `${stamp.mtimeMs.toString(36)}-${stamp.size.toString(36)}`;
  } catch {
    return 'dev';
  }
}

function injectEnv(html, distRoot, name, publicBase) {
  // Client keys are read from the DOM at runtime, never baked into the bundle.
  const env = {
    MAPBOX_TOKEN,
    EXPO_PUBLIC_MAPBOX_TOKEN: MAPBOX_TOKEN,
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    GOOGLE_WEB_CLIENT_ID: process.env.GOOGLE_WEB_CLIENT_ID || '',
    GOOGLE_ANDROID_CLIENT_ID: process.env.GOOGLE_ANDROID_CLIENT_ID || '',
  };
  const version = bundleVersion(path.join(distRoot, name));
  const busted = html.replace(
    new RegExp(`(src=")(${publicBase}/[^"]*/bundle\\.js)(")`),
    `$1$2?v=${version}$3`,
  );
  // Optional dev-only rider session bootstrap: when AAGAM_RIDER_TOKEN is set the
  // harness seeds the persisted mobile session (the react-native-keychain web
  // mock reads localStorage) so the bundle boots straight into the rider UI with
  // no password prompt. The token is never baked into the bundle.
  const seedToken = process.env.AAGAM_RIDER_TOKEN || process.env.AAGAM_TOKEN || '';
  const sessionScript = seedToken
    ? `<script>(function(){try{var user={id:'rider-session',role:'RIDER',roles:['RIDER'],name:'Rider'};var session=JSON.stringify({version:1,user:user,token:${JSON.stringify(seedToken)}});localStorage.setItem('aagam.keychain.com.aagam.mobile.auth',JSON.stringify({username:'aagam-auth',value:session}));}catch(e){}})();</script>\n`
    : '';
  return busted.replace(
    '</head>',
    `<script>window.__ENV__ = ${JSON.stringify(env)};</script>\n` +
      sessionScript +
      `<script>(function(){try{var s=new EventSource('/__live');s.onmessage=function(){location.reload();};}catch(e){}})();</script>\n</head>`,
  );
}

// The injected index is built once and cached; the request handler serves the
// cached string, so no request path reads the filesystem. The cache is rebuilt
// below whenever the watcher sees a new build.
const indexCache = new Map();
function buildIndex(distRoot, publicBase, name) {
  const file = path.join(distRoot, name, 'index.html');
  const key = `${publicBase}/${name}`;
  if (!fs.existsSync(file)) {
    indexCache.set(key, null);
    return;
  }
  indexCache.set(key, injectEnv(fs.readFileSync(file, 'utf8'), distRoot, name, publicBase));
}

// Union of the local and live trees; either may be absent.
function serveTree(distRoot, publicBase) {
  for (const name of APPS) {
    const dir = path.join(distRoot, name);
    const key = `${publicBase}/${name}`;
    buildIndex(distRoot, publicBase, name);
    app.get(`${publicBase}/${name}/`, (_req, res) => {
      const html = indexCache.get(key);
      if (!html) return res.status(503).send(`${name} not built yet. Run the build command.`);
      res.type('html').send(html);
    });
    app.use(`${publicBase}/${name}`, express.static(dir, { index: false }));
    app.get(`${publicBase}/${name}`, (_req, res) => res.redirect(`${publicBase}/${name}/`));
  }
}

serveTree(DIST, '/preview');
if (LIVE_ORIGIN) serveTree(DIST_LIVE, '/live');

app.get('/', (_req, res) => {
  const li = (base) => APPS.map((a) => `<li><a href="${base}/${a}/">${a}</a></li>`).join('');
  res.type('html').send(
    '<h1>AAGAM mobile web preview</h1>' +
      '<h2>Local api-gateway</h2><ul>' + li('/preview') + '</ul>' +
      (LIVE_ORIGIN
        ? `<h2>Live origin (${LIVE_ORIGIN})</h2><ul>` + li('/live') + '</ul>'
        : '<p>Set AAGAAM_LIVE_ORIGIN to also serve the live copy.</p>'),
  );
});

// Watch the built bundles and reload connected browsers.
let reloadTimer = null;
for (const [distRoot, publicBase] of [[DIST, '/preview'], [DIST_LIVE, '/live']]) {
  if (!fs.existsSync(distRoot)) continue;
  fs.watch(distRoot, { recursive: true }, () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      for (const name of APPS) buildIndex(distRoot, publicBase, name);
      clients.forEach((client) => client.write('data: reload\n\n'));
    }, 250);
  });
}

server.on('request', app);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[preview] listening on :${PORT}`);
  console.log(`[preview] /api -> ${API_ORIGIN}${STRIP_API_PREFIX ? '' : ' (prefix kept)'}`);
  console.log(`[preview] static: ${DIST}`);
  if (LIVE_ORIGIN) console.log(`[preview] /live/api -> ${LIVE_ORIGIN}/api  (static: ${DIST_LIVE})`);
});
