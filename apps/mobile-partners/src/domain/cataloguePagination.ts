export type CataloguePage<T> = {
  items?: T[];
  page?: number;
  total?: number;
  totalPages?: number;
};

export function flattenCataloguePages<T extends { id: string }>(pages: CataloguePage<T>[] | undefined): T[] {
  const byId = new Map<string, T>();
  for (const page of pages || []) {
    for (const item of page.items || []) byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

export function nextCataloguePage<T>(lastPage: CataloguePage<T>): number | undefined {
  const page = Math.max(1, Number(lastPage.page) || 1);
  const totalPages = Math.max(1, Number(lastPage.totalPages) || 1);
  return page < totalPages ? page + 1 : undefined;
}
