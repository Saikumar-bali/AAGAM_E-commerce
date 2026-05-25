/* eslint-disable no-console */
/**
 * End-to-end ETA simulation check for tracking payload quality.
 *
 * Usage (PowerShell):
 * $env:API_URL="https://aagam-api-production.up.railway.app"
 * $env:ORDER_ID="your-order-id"
 * $env:CUSTOMER_TOKEN="customer-jwt"
 * $env:RIDER_TOKEN="rider-jwt"
 * node tests/simulate_eta_lifecycle.js
 *
 * Optional:
 * $env:DO_STALE_CHECK="1"        # waits >6 minutes and verifies stale ETA
 * $env:STALE_WAIT_MS="370000"    # override stale wait
 */

const API_URL = process.env.API_URL || "https://aagam-api-production.up.railway.app";
const ORDER_ID = process.env.ORDER_ID;
const CUSTOMER_TOKEN = process.env.CUSTOMER_TOKEN;
const RIDER_TOKEN = process.env.RIDER_TOKEN;
const DO_STALE_CHECK = process.env.DO_STALE_CHECK === "1";
const STALE_WAIT_MS = Number(process.env.STALE_WAIT_MS || 370000);

if (!ORDER_ID || !CUSTOMER_TOKEN) {
  console.error("Missing required env vars: ORDER_ID and CUSTOMER_TOKEN");
  process.exit(1);
}

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const detail = typeof data === "object" ? JSON.stringify(data) : String(data);
    throw new Error(`${method} ${path} failed: ${res.status} ${detail}`);
  }
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function getTracking() {
  return api(`/orders/my/${ORDER_ID}/tracking`, { token: CUSTOMER_TOKEN });
}

async function sendRiderPing({ latitude, longitude, speed }) {
  if (!RIDER_TOKEN) {
    throw new Error("RIDER_TOKEN is required to send rider-location ping");
  }
  await api("/tracking/rider-location", {
    method: "POST",
    token: RIDER_TOKEN,
    body: {
      orderId: ORDER_ID,
      latitude,
      longitude,
      ...(typeof speed === "number" ? { speed } : {}),
      source: "MOBILE",
    },
  });
}

function summarize(label, tracking) {
  const t = tracking?.tracking || {};
  console.log(
    `${label}: ETA=${t.etaMinutes ?? "null"} min, confidence=${t.etaConfidence ?? "n/a"}, stale=${Boolean(t.etaStale)}, distance=${t.distanceKm ?? "n/a"} km, speed=${t.speedKph ?? "n/a"} kph`,
  );
}

async function main() {
  console.log(`Using API_URL=${API_URL}`);
  console.log(`Testing order=${ORDER_ID}`);

  let payload = await getTracking();
  summarize("Initial", payload);

  if (RIDER_TOKEN) {
    console.log("Simulating HIGH confidence ETA with speed ping...");
    await sendRiderPing({
      latitude: payload?.store?.latitude ?? 17.78,
      longitude: payload?.store?.longitude ?? 83.36,
      speed: 6.5, // m/s
    });
    await new Promise((r) => setTimeout(r, 1500));
    payload = await getTracking();
    summarize("After speed ping", payload);
    assert(payload?.tracking?.etaStale === false, "ETA should be fresh after rider ping");
    assert(payload?.tracking?.etaMinutes != null, "ETA should be available after rider ping");
    assert(payload?.tracking?.etaConfidence === "HIGH", "ETA confidence should be HIGH when speed is present");

    console.log("Simulating MEDIUM confidence ETA with no-speed ping...");
    await sendRiderPing({
      latitude: (payload?.tracking?.latestLocation?.latitude ?? 17.7801) + 0.0005,
      longitude: (payload?.tracking?.latestLocation?.longitude ?? 83.3601) + 0.0005,
    });
    await new Promise((r) => setTimeout(r, 1500));
    payload = await getTracking();
    summarize("After no-speed ping", payload);
    assert(payload?.tracking?.etaStale === false, "ETA should remain fresh after no-speed ping");
    assert(payload?.tracking?.etaMinutes != null, "ETA should still be available");
    assert(payload?.tracking?.etaConfidence === "MEDIUM", "ETA confidence should be MEDIUM when speed is absent");

    if (DO_STALE_CHECK) {
      console.log(`Waiting ${STALE_WAIT_MS}ms to verify stale ETA behavior...`);
      await new Promise((r) => setTimeout(r, STALE_WAIT_MS));
      payload = await getTracking();
      summarize("After stale wait", payload);
      assert(payload?.tracking?.etaStale === true, "ETA should become stale after inactivity");
      assert(payload?.tracking?.etaMinutes == null, "ETA should be hidden when stale");
    }
  } else {
    console.log("RIDER_TOKEN not set: running read-only tracking payload check.");
    const t = payload?.tracking || {};
    assert(Object.prototype.hasOwnProperty.call(t, "etaStale"), "tracking.etaStale field is missing");
    assert(Object.prototype.hasOwnProperty.call(t, "etaConfidence"), "tracking.etaConfidence field is missing");
    console.log("Read-only check passed.");
  }

  console.log("ETA simulation checks completed successfully.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
