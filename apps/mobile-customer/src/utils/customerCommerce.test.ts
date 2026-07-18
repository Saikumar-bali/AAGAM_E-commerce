import {
  getCartItemCount,
  getCartTotal,
  getProductCartQuantity,
  groupProductsByCategory,
  normalizeProductImages,
} from './customerCommerce';

describe('customer commerce helpers', () => {
  it('normalizes the primary image and product gallery without duplicates', () => {
    expect(
      normalizeProductImages(
        {
          image: 'https://cdn.example.com/front.jpg',
          images: [
            'https://cdn.example.com/front.jpg',
            { url: 'https://cdn.example.com/back.jpg' },
            { uri: 'https://cdn.example.com/label.jpg' },
          ],
        },
        'https://cdn.example.com/fallback.jpg',
      ),
    ).toEqual([
      'https://cdn.example.com/front.jpg',
      'https://cdn.example.com/back.jpg',
      'https://cdn.example.com/label.jpg',
      'https://cdn.example.com/fallback.jpg',
    ]);
  });

  it('uses a fallback image when the product has no valid gallery', () => {
    expect(
      normalizeProductImages(
        { images: ['not-a-url', null] },
        'https://cdn.example.com/fallback.jpg',
      ),
    ).toEqual(['https://cdn.example.com/fallback.jpg']);
  });

  it('calculates live cart quantity and total from persisted lines', () => {
    const items = [
      { product: { id: 'p1', price: 120 }, quantity: 2 },
      { product: { id: 'p2', price: 35 }, quantity: 3 },
    ];

    expect(getCartItemCount(items)).toBe(5);
    expect(getProductCartQuantity(items, 'p1')).toBe(2);
    expect(getCartTotal(items)).toBe(345);
  });

  it('builds only populated category sections for the home screen', () => {
    const categories = [
      { id: 'fruit', name: 'Fruits' },
      { id: 'dairy', name: 'Dairy' },
      { id: 'empty', name: 'Empty' },
    ];
    const products = [
      { id: 'apple', categoryId: 'fruit' },
      { id: 'milk', category: { id: 'dairy' } },
    ];

    expect(groupProductsByCategory(categories, products)).toEqual([
      { category: categories[0], products: [products[0]] },
      { category: categories[1], products: [products[1]] },
    ]);
  });
});
