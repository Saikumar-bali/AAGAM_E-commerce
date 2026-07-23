export type StoreInventoryPricedProduct = {
  price: number;
  pricePaise?: number | null;
  mrpPaise?: number | null;
};

const safePaise = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

export const productSellingPricePaise = (product: StoreInventoryPricedProduct): number => {
  const explicit = safePaise(product.pricePaise);
  if (explicit !== null) return explicit;

  const legacyRupees = Number(product.price);
  return Number.isFinite(legacyRupees) && legacyRupees >= 0
    ? Math.round(legacyRupees * 100)
    : 0;
};

export const effectiveStoreSellingPricePaise = (
  product: StoreInventoryPricedProduct,
  storeSellingPricePaise?: number | null,
): number => safePaise(storeSellingPricePaise) ?? productSellingPricePaise(product);

export const productMrpPaise = (
  product: StoreInventoryPricedProduct,
  effectiveSellingPricePaise: number,
): number => Math.max(safePaise(product.mrpPaise) ?? productSellingPricePaise(product), effectiveSellingPricePaise);
