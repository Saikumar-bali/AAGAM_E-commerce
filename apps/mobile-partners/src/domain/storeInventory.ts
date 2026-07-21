export type StoreInventoryDraft = {
  quantity: string;
  sellingPrice: string;
};

export type ValidatedStoreInventoryDraft =
  | { valid: true; quantity: number; sellingPrice: number | null }
  | { valid: false; message: string };

export const parseWholeQuantity = (value: string | number): number | null => {
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 1_000_000) return null;
  return parsed;
};

const parseOptionalPrice = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || String(value).trim() === '') {
    return { valid: true as const, value: null };
  }
  const normalized = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return { valid: false as const, value: null };

  const [wholePart, fractionPart = ''] = normalized.split('.');
  const whole = Number(wholePart);
  if (!Number.isSafeInteger(whole) || whole < 0) return { valid: false as const, value: null };
  const fraction = `${fractionPart}000`;
  let paise = whole * 100 + Number(fraction.slice(0, 2));
  if (Number(fraction[2]) >= 5) paise += 1;
  if (!Number.isSafeInteger(paise)) return { valid: false as const, value: null };

  return { valid: true as const, value: paise / 100 };
};

export const validateStoreInventoryDraft = (
  draft: StoreInventoryDraft,
  quantityLabel = 'Stock',
): ValidatedStoreInventoryDraft => {
  const quantity = parseWholeQuantity(draft.quantity);
  if (quantity === null) {
    return {
      valid: false,
      message: `${quantityLabel} must be a whole number between 0 and 1,000,000.`,
    };
  }
  const price = parseOptionalPrice(draft.sellingPrice);
  if (!price.valid) {
    return { valid: false, message: 'Store price must be a valid non-negative amount.' };
  }
  return { valid: true, quantity, sellingPrice: price.value };
};

export const availableForSale = (item: {
  quantity: number;
  isListed: boolean;
  autoHideWhenOutOfStock: boolean;
}) => item.isListed && (item.quantity > 0 || !item.autoHideWhenOutOfStock);

export const defaultDraft = (quantity = 0, sellingPricePaise?: number | null): StoreInventoryDraft => ({
  quantity: String(quantity),
  sellingPrice: sellingPricePaise == null ? '' : String(sellingPricePaise / 100),
});
