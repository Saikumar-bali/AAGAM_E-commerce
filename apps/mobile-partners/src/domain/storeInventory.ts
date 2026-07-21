export type StoreInventoryDraft = {
  quantity: string;
  sellingPrice: string;
};

export const normalizeWholeQuantity = (value: string | number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
};

export const normalizeOptionalPrice = (value: string | number | null | undefined) => {
  if (value === '' || value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;

  const [wholePart, fractionPart = ''] = normalized.split('.');
  const fraction = `${fractionPart}000`;
  let paise = Number(wholePart) * 100 + Number(fraction.slice(0, 2));
  if (Number(fraction[2]) >= 5) paise += 1;

  return paise / 100;
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
