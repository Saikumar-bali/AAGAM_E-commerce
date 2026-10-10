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
const net = require('net');
const fs = require('fs');
const path = require('path');
const express = require('express');

const PORT = parseInt(process.env.PORT || '12001', 10);
const API_ORIGIN = (process.env.API_ORIGIN || 'http://127.0.0.1:3005').replace(/\/+$/, '');
const STRIP_API_PREFIX = process.env.STRIP_API_PREFIX !== '0';
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';
const DIST = path.resolve(__dirname, 'dist');

const apiUrl = new URL(API_ORIGIN);
const API_PROTOCOL = apiUrl.protocol.replace(':', '');

function proxyHttp(req, res, targetPath) {
  const target = new URL(API_ORIGIN + targetPath);
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.origin;
  delete headers.referer;
  headers.host = apiUrl.host;

  const upstream = http.request(
    {
      protocol: apiUrl.protocol,
      hostname: apiUrl.hostname,
      port: apiUrl.port || (API_PROTOCOL === 'https' ? 443 : 80),
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
    res.end(JSON.stringify({ error: 'bad_gateway', message: error.message, apiOrigin: API_ORIGIN }));
  });
  req.pipe(upstream);
}

// WebSocket upgrades (socket.io) are proxied at the TCP level.
const server = http.createServer();
server.on('upgrade', (req, socket, head) => {
  const upstream = net.connect(
    Number(apiUrl.port) || (API_PROTOCOL === 'https' ? 443 : 80),
    apiUrl.hostname,
    () => {
      const headerLines = [`GET ${req.url} HTTP/1.1`];
      for (const [key, value] of Object.entries(req.headers)) {
        if (key.toLowerCase() === 'host') headerLines.push(`Host: ${apiUrl.host}`);
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
  res.json({ ok: true, apiOrigin: API_ORIGIN, stripApiPrefix: STRIP_API_PREFIX, port: PORT }),
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

const APPS = ['mobile-partners', 'mobile-customer'];

app.use('/api', (req, res) => {
  const targetPath = STRIP_API_PREFIX ? req.url : '/api' + req.url;
  proxyHttp(req, res, targetPath || '/');
});
// socket.io connects to the origin root once API_URL ends in /api.
app.use('/socket.io', (req, res) => proxyHttp(req, res, '/socket.io' + req.url));

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

function injectEnv(html, name) {
  const env = {
    MAPBOX_TOKEN,
    EXPO_PUBLIC_MAPBOX_TOKEN: MAPBOX_TOKEN,
  };
  const version = bundleVersion(path.join(DIST, name));
  const busted = html.replace(/(src=")(\/preview\/[^"]*\/bundle\.js)(")/, `$1$2?v=${version}$3`);
  return busted.replace(
    '</head>',
    `<script>window.__ENV__ = ${JSON.stringify(env)};</script>\n` +
      `<script>(function(){try{var s=new EventSource('/__live');s.onmessage=function(){location.reload();};}catch(e){}})();</script>\n</head>`,
  );
}

for (const name of APPS) {
  const dir = path.join(DIST, name);
  app.get(`/preview/${name}/`, (_req, res) => {
    const file = path.join(dir, 'index.html');
    if (!fs.existsSync(file)) return res.status(503).send(`${name} not built yet. Run the build command.`);
    res.type('html').send(injectEnv(fs.readFileSync(file, 'utf8'), name));
  });
  app.use(`/preview/${name}`, express.static(dir, { index: false }));
  app.get(`/preview/${name}`, (_req, res) => res.redirect(`/preview/${name}/`));
}

app.get('/', (_req, res) =>
  res.type('html').send(
    '<h1>AAGAM mobile web preview</h1><ul>' +
      APPS.map((a) => `<li><a href="/preview/${a}/">${a}</a></li>`).join('') +
      '</ul>',
  ),
);

// Watch the built bundle and reload connected browsers.
let reloadTimer = null;
if (fs.existsSync(DIST)) {
  fs.watch(DIST, { recursive: true }, () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => clients.forEach((client) => client.write('data: reload\n\n')), 250);
  });
}

server.on('request', app);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[preview] listening on :${PORT}`);
  console.log(`[preview] /api -> ${API_ORIGIN}${STRIP_API_PREFIX ? '' : ' (prefix kept)'}`);
  console.log(`[preview] static: ${DIST}`);
});
