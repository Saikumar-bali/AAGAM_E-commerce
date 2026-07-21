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
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
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
