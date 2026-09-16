import { parseAddOns, parseVolumeLiters, sumAddOnLiters } from './delivery-add-on';

describe('parseVolumeLiters', () => {
  it('reads liter labels', () => {
    expect(parseVolumeLiters('+1L')).toBe(1);
    expect(parseVolumeLiters('0.5L')).toBe(0.5);
    expect(parseVolumeLiters('+2L BM')).toBe(2);
    expect(parseVolumeLiters('1.5 ltr')).toBe(1.5);
  });

  it('reads millilitre labels', () => {
    expect(parseVolumeLiters('500ml')).toBe(0.5);
    expect(parseVolumeLiters('250 ml')).toBe(0.25);
  });

  it('reads quarter-litre labels', () => {
    expect(parseVolumeLiters('0.25L')).toBe(0.25);
    expect(parseVolumeLiters('0.25L CM')).toBe(0.25);
    expect(parseVolumeLiters('AM: 0.25L')).toBe(0.25);
  });

  it('does not mistake a quarter litre for two litres', () => {
    // The old `includes('2')` check matched '0.25L' and returned 2.
    expect(parseVolumeLiters('0.25L')).not.toBe(2);
    expect(parseVolumeLiters('0.25L')).toBeLessThan(0.5);
  });

  it('returns null for weight and count labels', () => {
    expect(parseVolumeLiters('250g')).toBeNull();
    expect(parseVolumeLiters('1 Bowl')).toBeNull();
    expect(parseVolumeLiters('6 Pieces')).toBeNull();
    expect(parseVolumeLiters('~350g Bowl')).toBeNull();
  });
});

describe('parseAddOns', () => {
  it('parses EXTRA_MILK markers', () => {
    const entries = parseAddOns('[EXTRA: +1L|8000] Extra milk requested');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ qty: '+1L', paise: 8000, liters: 1 });
  });

  it('parses ATTACH_EVENING_MILK markers written as ADD-ON', () => {
    const entries = parseAddOns('[ADD-ON: +1L BM|8000] Customer requested 4 days');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ qty: '+1L BM', paise: 8000, liters: 1 });
  });

  it('reads markers from both deferred and failure reasons', () => {
    const entries = parseAddOns('[ADD-ON: 250g|4000] note', '[EXTRA: 500ml|4000]');
    expect(entries.map((e) => e.qty)).toEqual(['250g', '500ml']);
    expect(entries.map((e) => e.liters)).toEqual([null, 0.5]);
  });

  it('reads the add-on target slot without touching the base slot', () => {
    const entries = parseAddOns('[ADD-ON: +1L BM|8000|AM] note');
    expect(entries[0]).toMatchObject({ qty: '+1L BM', paise: 8000, slot: 'AM' });
  });

  it('ignores an invalid add-on slot rather than trusting it', () => {
    expect(parseAddOns('[ADD-ON: +1L BM|8000|EVENING]')[0].slot).toBeNull();
    expect(parseAddOns('[ADD-ON: +1L BM|8000|weird]')[0].slot).toBeNull();
  });

  it('parses markers written before the slot field existed', () => {
    const entries = parseAddOns('[ADD-ON: +1L BM|8000] legacy note');
    expect(entries[0]).toMatchObject({ qty: '+1L BM', paise: 8000, slot: null });
  });

  it('tolerates a missing amount', () => {
    const entries = parseAddOns('[EXTRA: +2L]');
    expect(entries).toHaveLength(1);
    expect(entries[0].paise).toBeNull();
    expect(entries[0].liters).toBe(2);
  });

  it('returns nothing when no markers are present', () => {
    expect(parseAddOns(null, undefined)).toEqual([]);
    expect(parseAddOns('plain delivery note')).toEqual([]);
  });

  it('does not treat malformed text as a marker', () => {
    expect(parseAddOns('[EXTRA: ]')).toEqual([]);
  });
});

describe('sumAddOnLiters', () => {
  it('counts attached volume add-ons that used the ADD-ON marker', () => {
    expect(sumAddOnLiters('[ADD-ON: +1L BM|8000] note')).toBe(1);
  });

  it('counts half-litre add-ons as 0.5 rather than a whole litre', () => {
    expect(sumAddOnLiters('[EXTRA: 0.5L|4000]')).toBe(0.5);
  });

  it('excludes weight and count add-ons from milk volume', () => {
    expect(sumAddOnLiters('[ADD-ON: 250g|4000] fresh produce')).toBe(0);
    expect(sumAddOnLiters('[ADD-ON: 1 Bowl|12000] fruit bowl')).toBe(0);
  });

  it('sums mixed volume and non-volume add-ons', () => {
    expect(sumAddOnLiters('[EXTRA: +1L|8000]', '[ADD-ON: 500ml|4000]')).toBe(1.5);
    expect(sumAddOnLiters('[ADD-ON: 250g|4000]', '[EXTRA: +1L|8000]')).toBe(1);
  });

  it('is zero without markers', () => {
    expect(sumAddOnLiters(null, undefined, 'nothing here')).toBe(0);
  });
});
