/* Preview-only entry: mounts the REAL `RiderRouteMap` component with mock run
 * data so the rider live-location / stop pins / blue route line can be eyeballed
 * in the react-native-web preview. The map HTML itself is swapped for the
 * token-free mock (see mocks/rider-route-map-html.js) purely because the sandbox
 * has no valid Mapbox token; every other line of the component + wiring is the
 * production code.
 */
import './polyfills';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RiderRouteMap } from '@app/src/components/rider/RiderRouteMap';

// Anakapalle-area demo route (same locality as the store geolocation mock).
const STOPS = [
  { latitude: 17.7361, longitude: 82.9791, sequence: 1, label: 'Ravi', state: 'done' },
  { latitude: 17.7344, longitude: 82.9849, sequence: 2, label: 'Nookalamma', state: 'current' },
  { latitude: 17.7302, longitude: 82.9906, sequence: 3, label: 'Suresh', state: 'upcoming' },
  { latitude: 17.7268, longitude: 82.9772, sequence: 4, label: 'Lakshmi', state: 'upcoming' },
  { latitude: 17.7412, longitude: 82.9889, sequence: 5, label: 'Anitha', state: 'upcoming' },
];

const lerp = (a, b, t) => a + (b - a) * t;

function App() {
  const [tick, setTick] = useState(0);
  const [moving, setMoving] = useState(true);
  const [done, setDone] = useState(1);
  const [navMode, setNavMode] = useState(false);
  const timer = useRef(null);

  const current = STOPS[1];
  const previous = STOPS[0];

  // Rider walks from the previous (delivered) stop toward the current stop; the
  // blue route line redraws from the live dot to the destination each tick.
  const riderLocation = useMemo(() => {
    const t = (Math.sin(tick / 8) + 1) / 2; // 0..1 ping-pong
    return { latitude: lerp(previous.latitude, current.latitude, t), longitude: lerp(previous.longitude, current.longitude, t) };
  }, [tick]);

  useEffect(() => {
    if (!moving) return undefined;
    timer.current = setInterval(() => setTick((v) => v + 1), 700);
    return () => clearInterval(timer.current);
  }, [moving]);

  return React.createElement(
    'div',
    { style: { minHeight: '100vh', background: '#f8fafc', padding: 16, fontFamily: 'system-ui', display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' } },
    React.createElement(
      'div',
      { style: { width: 390, maxWidth: '100%' } },
      React.createElement('h3', { style: { margin: '0 0 4px' } }, 'Rider route map (real component)'),
      React.createElement('p', { style: { margin: '0 0 12px', color: '#475569', fontSize: 13 } },
        'Blue line = rider → destination (live). Numbered pins = stops. Pulsing dot = live rider GPS.'),
      React.createElement(RiderRouteMap, {
        destination: current,
        destinationLabel: `${current.label} · stop 2`,
        active: true,
        riderLocation,
        stops: STOPS,
        progressDone: done,
        progressTotal: STOPS.length,
      }),
    ),
    React.createElement(
      'div',
      { style: { width: 260, fontSize: 13, color: '#334155' } },
      React.createElement('h4', { style: { margin: '0 0 8px' } }, 'Controls'),
      React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
        React.createElement('button', { onClick: () => setMoving((m) => !m), style: btn }, moving ? 'Pause GPS' : 'Resume GPS'),
        React.createElement('button', { onClick: () => setDone((d) => Math.min(STOPS.length, d + 1)), style: btn }, 'Mark delivered'),
        React.createElement('button', { onClick: () => setDone(1), style: btn }, 'Reset'),
      ),
      React.createElement('p', { style: { marginTop: 12, color: '#64748b' } },
        `rider lat/lng: ${riderLocation.latitude.toFixed(5)}, ${riderLocation.longitude.toFixed(5)}`),
      React.createElement('p', { style: { color: '#64748b' } }, `progress: ${done}/${STOPS.length}`),
    ),
  );
}

const btn = { padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' };

createRoot(document.getElementById('root')).render(React.createElement(App, null));
window.__AAGAM_PREVIEW_READY__ = true;
