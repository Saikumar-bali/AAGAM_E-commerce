export const STORE_PRODUCT_PAGE_SIZE = 50;
const MAX_PRODUCT_PAGES = 2_000;

type ProductWithId = { id: string } & Record<string, unknown>;
type ProductPageRequester = (page: number, pageSize: number) => Promise<unknown>;

function addUniqueProducts(target: Map<string, ProductWithId>, rows: unknown) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const id = (row as Record<string, unknown>).id;
    if (typeof id !== 'string' || !id) continue;
    target.set(id, row as ProductWithId);
  }
}

/** Loads the complete active product catalogue while respecting QueryProductsDto. */
export async function loadPaginatedProducts(requestPage: ProductPageRequester): Promise<ProductWithId[]> {
  const products = new Map<string, ProductWithId>();
  const visitedPages = new Set<number>();
  let page = 1;
  let totalPages: number | null = null;

  while (page <= (totalPages ?? 1) && page <= MAX_PRODUCT_PAGES) {
    if (visitedPages.has(page)) break;
    visitedPages.add(page);

    const payload = await requestPage(page, STORE_PRODUCT_PAGE_SIZE);
    if (Array.isArray(payload)) {
      addUniqueProducts(products, payload);
      break;
    }

    if (!payload || typeof payload !== 'object') break;
    const record = payload as Record<string, unknown>;
    const items = Array.isArray(record.items)
      ? record.items
      : Array.isArray(record.products)
        ? record.products
        : [];
    addUniqueProducts(products, items);

    const declaredTotalPages = Number(record.totalPages);
    if (totalPages === null) {
      if (!Number.isInteger(declaredTotalPages) || declaredTotalPages < 1) break;
      totalPages = Math.min(declaredTotalPages, MAX_PRODUCT_PAGES);
    }

    if (page >= totalPages || items.length === 0) break;
    page += 1;
  }

  return Array.from(products.values());
}
