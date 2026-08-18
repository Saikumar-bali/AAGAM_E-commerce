import type { DeliveryFeeRule } from '@aagam/database';
import { DeliveryFeeMatchType } from '@aagam/database';
import { matchDeliveryFeeRule, DeliveryFeeRuleMatchInput } from './delivery-fee-rules.service';

function rule(partial: Partial<DeliveryFeeRule>): DeliveryFeeRule {
  return {
    id: 'r_' + Math.random().toString(36).slice(2),
    name: 'Test rule',
    matchType: DeliveryFeeMatchType.KEYWORD,
    pincode: null,
    city: null,
    keywords: [],
    storeId: null,
    ratePaisePerKm: 200,
    flatFeePaise: null,
    freeDeliveryMinimumPaise: null,
    maximumDistanceKm: null,
    priority: 100,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as DeliveryFeeRule;
}

const input = (
  overrides: Partial<DeliveryFeeRuleMatchInput> = {},
): DeliveryFeeRuleMatchInput => ({
  pincode: '531035',
  city: 'Anakapalle',
  freeText: 'Anakapalle - Chodavaram Road, Tulsi Nagar, Thummapala, Andhra Pradesh',
  ...overrides,
});

describe('matchDeliveryFeeRule', () => {
  it('matches an exact pincode regardless of formatting', () => {
    const pin = rule({ matchType: DeliveryFeeMatchType.PINCODE, pincode: '531035', ratePaisePerKm: 250 });
    const match = matchDeliveryFeeRule([pin], input({ pincode: '531-035' }));
    expect(match?.id).toBe(pin.id);
  });

  it('matches by city name', () => {
    const city = rule({ matchType: DeliveryFeeMatchType.CITY, city: 'Anakapalle', ratePaisePerKm: 220 });
    const match = matchDeliveryFeeRule([city], input());
    expect(match?.id).toBe(city.id);
  });

  it('matches a locality keyword found anywhere in the free-text address', () => {
    const keyword = rule({ matchType: DeliveryFeeMatchType.KEYWORD, keywords: ['Thummapala'], ratePaisePerKm: 300 });
    const match = matchDeliveryFeeRule([keyword], input());
    expect(match?.id).toBe(keyword.id);
  });

  it('is case-insensitive and ignores punctuation in keyword matches', () => {
    const keyword = rule({
      matchType: DeliveryFeeMatchType.KEYWORD,
      keywords: ['Tulsi Nagar'],
      ratePaisePerKm: 280,
    });
    const match = matchDeliveryFeeRule([keyword], input({ freeText: 'tulsi-nagar road, thummapala' }));
    expect(match?.id).toBe(keyword.id);
  });

  it('prefers the lowest priority rule when several match', () => {
    const broad = rule({ matchType: DeliveryFeeMatchType.KEYWORD, keywords: ['Thummapala'], priority: 50, ratePaisePerKm: 200 });
    const narrow = rule({ matchType: DeliveryFeeMatchType.KEYWORD, keywords: ['Thummapala'], priority: 10, ratePaisePerKm: 350 });
    const match = matchDeliveryFeeRule([broad, narrow], input());
    expect(match?.id).toBe(narrow.id);
  });

  it('falls back to the DEFAULT rule when nothing else matches', () => {
    const fallback = rule({ matchType: DeliveryFeeMatchType.DEFAULT, priority: 999, ratePaisePerKm: 150 });
    const pin = rule({ matchType: DeliveryFeeMatchType.PINCODE, pincode: '999999', ratePaisePerKm: 250 });
    const match = matchDeliveryFeeRule([pin, fallback], input());
    expect(match?.id).toBe(fallback.id);
  });

  it('returns null when no rule matches and there is no DEFAULT rule', () => {
    const pin = rule({ matchType: DeliveryFeeMatchType.PINCODE, pincode: '999999' });
    expect(matchDeliveryFeeRule([pin], input())).toBeNull();
  });

  it('requires a non-empty pincode before a PINCODE rule can match', () => {
    const pin = rule({ matchType: DeliveryFeeMatchType.PINCODE, pincode: '531035' });
    expect(matchDeliveryFeeRule([pin], input({ pincode: '' }))).toBeNull();
  });

  it('matches the store-specific rule before the global rule of the same priority', () => {
    const local = rule({ matchType: DeliveryFeeMatchType.CITY, city: 'Anakapalle', storeId: 'store_a', ratePaisePerKm: 275, priority: 20 });
    const global = rule({ matchType: DeliveryFeeMatchType.CITY, city: 'Anakapalle', storeId: null, ratePaisePerKm: 200, priority: 20 });
    const match = matchDeliveryFeeRule([global, local], input());
    expect(match?.id).toBe(local.id);
  });
});