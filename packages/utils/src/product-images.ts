type ProductImageInput = {
  id?: string | null;
  name?: string | null;
  image?: string | null;
  category?: { name?: string | null } | null;
};

const IMAGE_BY_PRODUCT_ID: Record<string, string> = {
  'prod-1': 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=900&h=650&fit=crop',
  'prod-2': 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=900&h=650&fit=crop',
  'prod-3': 'https://images.unsplash.com/photo-1508747703725-719777637510?w=900&h=650&fit=crop',
  'prod-4': 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=900&h=650&fit=crop',
  'prod-5': 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=900&h=650&fit=crop',
  'prod-6': 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=900&h=650&fit=crop',
  'prod-7': 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=900&h=650&fit=crop',
  'prod-8': 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=900&h=650&fit=crop',
  'prod-9': 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=900&h=650&fit=crop',
  'prod-10': 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=900&h=650&fit=crop',
};

const IMAGE_BY_KEYWORD: Array<[RegExp, string]> = [
  [/tomato/i, IMAGE_BY_PRODUCT_ID['prod-1']],
  [/potato/i, IMAGE_BY_PRODUCT_ID['prod-2']],
  [/onion/i, IMAGE_BY_PRODUCT_ID['prod-3']],
  [/apple/i, IMAGE_BY_PRODUCT_ID['prod-4']],
  [/banana/i, IMAGE_BY_PRODUCT_ID['prod-5']],
  [/milk/i, IMAGE_BY_PRODUCT_ID['prod-6']],
  [/curd|yogurt|yoghurt/i, IMAGE_BY_PRODUCT_ID['prod-7']],
  [/bread/i, IMAGE_BY_PRODUCT_ID['prod-8']],
  [/egg/i, IMAGE_BY_PRODUCT_ID['prod-9']],
  [/water/i, IMAGE_BY_PRODUCT_ID['prod-10']],
];

const IMAGE_BY_CATEGORY: Record<string, string> = {
  vegetables: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=900&h=650&fit=crop',
  groceries: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=900&h=650&fit=crop',
  fruits: 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=900&h=650&fit=crop',
  'milk & dairy': 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=900&h=650&fit=crop',
  eggs: IMAGE_BY_PRODUCT_ID['prod-9'],
  beverages: IMAGE_BY_PRODUCT_ID['prod-10'],
  snacks: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=900&h=650&fit=crop',
  staples: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=900&h=650&fit=crop',
  electronics: 'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=900&h=650&fit=crop',
  clothing: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=900&h=650&fit=crop',
};

export const DEFAULT_PRODUCT_IMAGE =
  'https://images.unsplash.com/photo-1542838132-92c53300491e?w=900&h=650&fit=crop';

export function getProductImage(product: ProductImageInput): string {
  if (product.image) return product.image;

  const id = product.id || '';
  if (IMAGE_BY_PRODUCT_ID[id]) return IMAGE_BY_PRODUCT_ID[id];

  const name = product.name || '';
  const keywordMatch = IMAGE_BY_KEYWORD.find(([pattern]) => pattern.test(name));
  if (keywordMatch) return keywordMatch[1];

  const category = (product.category?.name || '').toLowerCase();
  if (category && IMAGE_BY_CATEGORY[category]) return IMAGE_BY_CATEGORY[category];

  return DEFAULT_PRODUCT_IMAGE;
}
