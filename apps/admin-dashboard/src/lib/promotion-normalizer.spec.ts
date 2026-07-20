import { normalizePromotionPlacements, PlacementMap } from './promotion-normalizer';

describe('normalizePromotionPlacements', () => {
  test('extracts placements from current envelope', () => {
    const response = {
      serverTime: '2026-07-20T00:00:00.000Z',
      placements: {
        LOGIN_SIDEBAR: [{ id: 'c1', title: 'Login offer' }],
        LANDING_HERO: [{ id: 'c2', title: 'Hero' }],
        LANDING_BANNER: [],
      },
    };
    const result = normalizePromotionPlacements(response);
    expect(result.LOGIN_SIDEBAR).toHaveLength(1);
    expect(result.LOGIN_SIDEBAR[0].id).toBe('c1');
    expect(result.LANDING_HERO).toHaveLength(1);
    expect(result.LANDING_BANNER).toHaveLength(0);
  });

  test('handles missing placements key gracefully', () => {
    const result = normalizePromotionPlacements({ serverTime: '2026-07-20' });
    expect(result).toEqual({});
  });

  test('handles legacy unwrapped payload', () => {
    const legacy = {
      LOGIN_SIDEBAR: [{ id: 'leg1', title: 'Legacy login' }],
      LANDING_HERO: [],
      LANDING_BANNER: [{ id: 'leg2', title: 'Legacy banner' }],
    };
    const result = normalizePromotionPlacements(legacy);
    expect(result.LOGIN_SIDEBAR).toHaveLength(1);
    expect(result.LANDING_BANNER).toHaveLength(1);
  });

  test('returns empty object for invalid payload', () => {
    expect(normalizePromotionPlacements(null)).toEqual({});
    expect(normalizePromotionPlacements(undefined)).toEqual({});
    expect(normalizePromotionPlacements('string')).toEqual({});
    expect(normalizePromotionPlacements(42)).toEqual({});
  });

  test('returns empty object for empty object', () => {
    expect(normalizePromotionPlacements({})).toEqual({});
  });
});
