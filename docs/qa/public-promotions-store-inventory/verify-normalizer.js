// Inline verification of promotion normalizer logic
function normalizePromotionPlacements(response) {
  if (!response || typeof response !== 'object') return {};
  const payload = response;
  if (payload.placements && typeof payload.placements === 'object' && !Array.isArray(payload.placements)) {
    return payload.placements;
  }
  const values = Object.values(payload);
  if (values.length > 0 && values.every((v) => Array.isArray(v))) {
    return payload;
  }
  return {};
}

// Test 1: Current envelope
const r1 = normalizePromotionPlacements({
  serverTime: '2026-07-20',
  placements: {
    LOGIN_SIDEBAR: [{ id: 'c1', title: 'Login' }],
    LANDING_HERO: [{ id: 'c2' }],
    LANDING_BANNER: [],
  },
});
console.assert(r1.LOGIN_SIDEBAR?.length === 1, 'Test 1a: LOGIN_SIDEBAR should have 1 item');
console.assert(r1.LANDING_HERO?.length === 1, 'Test 1b: LANDING_HERO should have 1 item');
console.assert(r1.LANDING_BANNER?.length === 0, 'Test 1c: LANDING_BANNER should be empty');
console.log('PASS: current envelope');

// Test 2: Missing placements
const r2 = normalizePromotionPlacements({ serverTime: '2026-07-20' });
console.assert(Object.keys(r2).length === 0, 'Test 2: missing placements should return {}');
console.log('PASS: missing placements');

// Test 3: Legacy unwrapped
const r3 = normalizePromotionPlacements({
  LOGIN_SIDEBAR: [{ id: 'leg1' }],
  LANDING_HERO: [],
  LANDING_BANNER: [{ id: 'leg2' }],
});
console.assert(r3.LOGIN_SIDEBAR?.length === 1, 'Test 3a: legacy LOGIN_SIDEBAR');
console.assert(r3.LANDING_BANNER?.length === 1, 'Test 3b: legacy LANDING_BANNER');
console.log('PASS: legacy unwrapped');

// Test 4: Invalid payload
const r4a = normalizePromotionPlacements(null);
const r4b = normalizePromotionPlacements(undefined);
const r4c = normalizePromotionPlacements('string');
const r4d = normalizePromotionPlacements(42);
console.assert(Object.keys(r4a).length === 0, 'Test 4a: null');
console.assert(Object.keys(r4b).length === 0, 'Test 4b: undefined');
console.assert(Object.keys(r4c).length === 0, 'Test 4c: string');
console.assert(Object.keys(r4d).length === 0, 'Test 4d: number');
console.log('PASS: invalid payload');

// Test 5: Empty object
const r5 = normalizePromotionPlacements({});
console.assert(Object.keys(r5).length === 0, 'Test 5: empty object');
console.log('PASS: empty object');

console.log('\nAll 5 normalizer tests PASSED');
