/**
 * Normalizes the public promotions API response into a consistent placements
 * map.  The current API contract returns:
 *
 *   { serverTime, placements: { LOGIN_SIDEBAR: [...], LANDING_HERO: [...], … } }
 *
 * A legacy/unwrapped shape where `placements` is the top-level object is also
 * supported for backward compatibility.
 */
export type PlacementMap = Record<string, any[]>;

export function normalizePromotionPlacements(
  response: unknown,
): PlacementMap {
  if (!response || typeof response !== 'object') return {};
  const payload = response as Record<string, unknown>;

  // Current envelope – placements nested under a `placements` key.
  if (
    payload.placements &&
    typeof payload.placements === 'object' &&
    !Array.isArray(payload.placements)
  ) {
    return payload.placements as PlacementMap;
  }

  // Legacy / unwrapped – the response itself *is* the placements map (every
  // value is an array of campaigns).
  const values = Object.values(payload);
  if (values.length > 0 && values.every((v) => Array.isArray(v))) {
    return payload as PlacementMap;
  }

  return {};
}
