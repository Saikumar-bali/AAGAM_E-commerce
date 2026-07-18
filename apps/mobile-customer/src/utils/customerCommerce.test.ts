import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCartItemCount,
  getCartTotal,
  getProductCartQuantity,
  groupProductsByCategory,
  normalizeProductImages,
} from './customerCommerce.ts';

test('normalizes product gallery without duplicates', () => {
  assert.deepEqual(
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
    [
      'https://cdn.example.com/front.jpg',
      'https://cdn.example.com/back.jpg',
      'https://cdn.example.com/label.jpg',
      'https://cdn.example.com/fallback.jpg',
    ],
  );
});

test('uses the fallback when gallery values are invalid', () => {
  assert.deepEqual(
    normalizeProductImages(
      { images: ['not-a-url', null] },
      'https://cdn.example.com/fallback.jpg',
    ),
    ['https://cdn.example.com/fallback.jpg'],
  );
});

test('calculates live cart quantities and total', () => {
  const items = [
    { product: { id: 'p1', price: 120 }, quantity: 2 },
    { product: { id: 'p2', price: 35 }, quantity: 3 },
  ];
  assert.equal(getCartItemCount(items), 5);
  assert.equal(getProductCartQuantity(items, 'p1'), 2);
  assert.equal(getCartTotal(items), 345);
});

test('groups only populated categories', () => {
  const categories = [
    { id: 'fruit', name: 'Fruits' },
    { id: 'dairy', name: 'Dairy' },
    { id: 'empty', name: 'Empty' },
  ];
  const products = [
    { id: 'apple', categoryId: 'fruit' },
    { id: 'milk', category: { id: 'dairy' } },
  ];
  assert.deepEqual(groupProductsByCategory(categories, products), [
    { category: categories[0], products: [products[0]] },
    { category: categories[1], products: [products[1]] },
  ]);
});
