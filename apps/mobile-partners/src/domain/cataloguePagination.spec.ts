import { flattenCataloguePages, nextCataloguePage } from './cataloguePagination';

describe('catalogue pagination', () => {
  it('keeps earlier products when a later page loads', () => {
    expect(flattenCataloguePages([
      { page: 1, totalPages: 2, items: [{ id: 'p1' }, { id: 'p2' }] },
      { page: 2, totalPages: 2, items: [{ id: 'p3' }] },
    ])).toEqual([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);
  });

  it('deduplicates products returned across page boundaries', () => {
    expect(flattenCataloguePages([
      { items: [{ id: 'p1', name: 'Old' }] },
      { items: [{ id: 'p1', name: 'Updated' }, { id: 'p2', name: 'Second' }] },
    ])).toEqual([{ id: 'p1', name: 'Updated' }, { id: 'p2', name: 'Second' }]);
  });

  it('stops pagination on the final page', () => {
    expect(nextCataloguePage({ page: 1, totalPages: 3 })).toBe(2);
    expect(nextCataloguePage({ page: 3, totalPages: 3 })).toBeUndefined();
  });
});
