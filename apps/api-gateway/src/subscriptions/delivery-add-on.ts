/**
 * Shared parser for delivery add-on markers.
 *
 * `EXTRA_MILK` writes `[EXTRA: <qty>|<paise>]` and `ATTACH_EVENING_MILK`
 * writes `[ADD-ON: <qty>|<paise>|<slot>]` into a delivery's free-text fields.
 * Both must feed the same grid, dispatch and statement totals, otherwise
 * attached add-ons silently disappear from operational volume.
 */
export interface AddOnEntry {
  qty: string;
  paise: number | null;
  /** Volume in liters, or null when the label carries no volume. */
  liters: number | null;
  /**
   * Slot the add-on applies to (AM/PM). The add-on's target is recorded here so
   * it does not have to overwrite the base delivery's own slot.
   */
  slot: string | null;
}

// The trailing slot group is optional so markers written before it existed
// still parse.
const ADD_ON_PATTERN = /\[(?:EXTRA|ADD-ON):\s*([^|\]]+)\|?\s*(\d+)?(?:\|([^\]]*))?\]/g;

/**
 * Volume in liters for a quantity label, or null when the label has no volume
 * (weights like `250g`, counts like `1 Bowl`). Treating those as one liter
 * each inflates milk totals.
 */
export function parseVolumeLiters(label: string): number | null {
  const text = label.toLowerCase();
  // Per-unit volume first. The `(?<!\d)` guards keep these patterns linear;
  // without them a long run of digits (a client-supplied `extraQuantity`) makes
  // the engine retry the number from every digit position.
  let unitVolume: number | null = null;
  const ml = text.match(/(?<!\d)(\d+(?:\.\d+)?)\s*ml\b/);
  if (ml) {
    unitVolume = Number(ml[1]) / 1000;
  } else {
    // Fractions must be read before the integer form: the "1/2 L" in an add-on
    // like `1 Unit AAGAAM BUFFALO MILK 1/2 (LITER)` is a half litre, not 2.
    const fraction = text.match(/(?<!\d)(\d+)\s*\/\s*(\d+)\s*(?:l|lt|ltr|liter|litre)\b/)
      || text.match(/(?<!\d)(\d+)\s*\/\s*(\d+)\s*\((?:l|lt|ltr|liter|litre)\)/);
    if (fraction && Number(fraction[2]) > 0) {
      unitVolume = Number(fraction[1]) / Number(fraction[2]);
    } else {
      const liters = text.match(/(?<!\d)(\d+(?:\.\d+)?)\s*(?:l|lt|ltr|liter|litre)\b/);
      if (liters) unitVolume = Number(liters[1]);
    }
  }

  if (unitVolume !== null) {
    // A rider-entered "N unit(s)/packet(s)" multiplies the per-unit volume, so
    // `2 Packets AAGAAM COW MILK 1 LITER` is 2L rather than 1L.
    const counted = text.match(/(?<!\d)(\d+(?:\.\d+)?)\s*(?:units?|packets?|packs?|pkts?|bottles?|pouches?|nos?\.?|pieces?|pcs?)\b/);
    return counted ? Number(counted[1]) * unitVolume : unitVolume;
  }

  // Anchored without a trailing `\s*`, which made a run of spaces re-anchor at
  // every position; `trimEnd` gives the same result in linear time.
  const bare = text.trimEnd().match(/(?<!\d)\+?(\d+(?:\.\d+)?)$/);
  if (bare) return Number(bare[1]);
  return null;
}

/** Reads every add-on marker found across the supplied text fields. */
export function parseAddOns(
  ...texts: Array<string | null | undefined>
): AddOnEntry[] {
  const combined = texts.filter(Boolean).join(' ');
  const entries: AddOnEntry[] = [];
  ADD_ON_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ADD_ON_PATTERN.exec(combined)) !== null) {
    const qty = match[1].trim();
    if (!qty) continue;
    const slot = match[3]?.trim().toUpperCase();
    entries.push({
      qty,
      paise: match[2] ? Number(match[2]) : null,
      liters: parseVolumeLiters(qty),
      slot: slot === 'AM' || slot === 'PM' ? slot : null,
    });
  }
  return entries;
}

/** Total volume contributed by the add-on markers in the supplied fields. */
export function sumAddOnLiters(
  ...texts: Array<string | null | undefined>
): number {
  return parseAddOns(...texts).reduce((sum, entry) => sum + (entry.liters ?? 0), 0);
}