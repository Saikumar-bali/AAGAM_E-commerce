export type CartLine = {
  product?: { id?: string | null; price?: number | null } | null;
  quantity?: number | null;
};

type ImageCandidate =
  | string
  | {
      url?: string | null;
      uri?: string | null;
      image?: string | null;
    }
  | null
  | undefined;

type CategoryLike = { id: string; name: string };
type ProductLike = {
  id: string;
  categoryId?: string | null;
  category?: { id?: string | null } | null;
};

function imageValue(candidate: ImageCandidate): string {
  if (typeof candidate === 'string') return candidate.trim();
  if (!candidate || typeof candidate !== 'object') return '';
  return String(candidate.url || candidate.uri || candidate.image || '').trim();
}

function imageCandidates(value: unknown): ImageCandidate[] {
  if (Array.isArray(value)) return value as ImageCandidate[];
  if (typeof value !== 'string') return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? (parsed as ImageCandidate[]) : [parsed as ImageCandidate];
  } catch {
    return trimmed.split(/[\n,]+/).map((item) => item.trim());
  }
}

export function normalizeProductImages(product: any, fallbackImage: string): string[] {
  const candidates: ImageCandidate[] = [
    product?.image,
    ...imageCandidates(product?.images),
    fallbackImage,
  ];

  return Array.from(
    new Set(candidates.map(imageValue).filter((value) => /^https?:\/\//i.test(value))),
  );
}

export function getCartItemCount(items: CartLine[]): number {
  return items.reduce((count, item) => count + Math.max(0, Number(item.quantity) || 0), 0);
}

export function getProductCartQuantity(items: CartLine[], productId?: string | null): number {
  if (!productId) return 0;
  return items.find((item) => item.product?.id === productId)?.quantity || 0;
}

export function getCartTotal(items: CartLine[]): number {
  return items.reduce(
    (total, item) =>
      total + (Number(item.product?.price) || 0) * Math.max(0, Number(item.quantity) || 0),
    0,
  );
}

export function getProductMrp(product: any): number {
  const mrpPaise = Number(product?.mrpPaise);
  if (Number.isFinite(mrpPaise) && mrpPaise > 0) return mrpPaise / 100;
  const legacyMrp = Number(product?.mrp ?? product?.originalPrice);
  if (Number.isFinite(legacyMrp) && legacyMrp > 0) return legacyMrp;
  return Number(product?.price) || 0;
}

export function groupProductsByCategory<T extends ProductLike>(
  categories: CategoryLike[],
  products: T[],
): Array<{ category: CategoryLike; products: T[] }> {
  return categories
    .map((category) => ({
      category,
      products: products.filter(
        (product) =>
          product.categoryId === category.id || product.category?.id === category.id,
      ),
    }))
    .filter((section) => section.products.length > 0);
}
