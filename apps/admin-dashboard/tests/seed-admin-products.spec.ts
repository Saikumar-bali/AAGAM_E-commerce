import { test, expect, Page } from '@playwright/test';
import path from 'path';

const ZEPTO_DIR = path.resolve(__dirname, '../../../zepto_data');
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@aagam.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin@2026!';

type ProductEntry = {
  dir: string;
  category: string;
  sortOrder: number;
};

const PRODUCTS: ProductEntry[] = [
  { dir: 'Fruits & Vegetables/fresh-fruits/grapes-green', category: 'Fresh Fruits', sortOrder: 1 },
  { dir: 'Fruits & Vegetables/fresh-fruits/guava-thai', category: 'Fresh Fruits', sortOrder: 2 },
  { dir: 'Fruits & Vegetables/fresh-fruits/cherry', category: 'Fresh Fruits', sortOrder: 3 },
  { dir: 'Fruits & Vegetables/fresh-fruits/coconut', category: 'Fresh Fruits', sortOrder: 4 },
  { dir: 'Fruits & Vegetables/fresh-vegetables/onion', category: 'Fresh Vegetables', sortOrder: 1 },
  { dir: 'Fruits & Vegetables/fresh-vegetables/lady-finger', category: 'Fresh Vegetables', sortOrder: 2 },
  { dir: 'Fruits & Vegetables/fresh-vegetables/capsicum-green', category: 'Fresh Vegetables', sortOrder: 3 },
  { dir: 'Fruits & Vegetables/grocery/chilli-green', category: 'Grocery', sortOrder: 1 },
  { dir: 'Fruits & Vegetables/grocery/rose-flower-mix', category: 'Grocery', sortOrder: 2 },
  { dir: 'Fruits & Vegetables/grocery/mint-leaves', category: 'Grocery', sortOrder: 3 },
];

function findInfo(info: Record<string, string>, label: string): string {
  const lc = label.toLowerCase();
  for (const [k, v] of Object.entries(info)) {
    if (String(k).trim().toLowerCase() === lc) return String(v).trim();
    if (String(v).trim().toLowerCase() === lc) return String(k).trim();
  }
  return '';
}

function buildDetails(data: any): Record<string, string> {
  const h = data.highlights || {};
  const info = data.information || {};
  const d: Record<string, string> = {};

  const map: Record<string, string> = {
    'Brand': 'brand', 'Product Type': 'productType', 'Flavour': 'flavour',
    'Material type free': 'materialTypeFree', 'Key Features': 'keyFeatures',
    'Item Form': 'itemForm', 'Ingredients': 'ingredients',
    'Allergen information': 'allergenInformation', 'FSSAI license': 'fssaiLicense',
    'Nutrition information': 'nutritionInformation', 'Dietary Preference': 'dietaryPreference',
    'Spice level': 'spiceLevel', 'Cuisine type': 'cuisineType',
    'Packaging type': 'packagingType', 'Storage instruction': 'storageInstruction',
    'Is perishable': 'isPerishable', 'Serving size': 'servingSize',
    'Weight': 'weight', 'Unit': 'unit',
  };

  for (const [src, dest] of Object.entries(map)) {
    if (h[src]) d[dest] = String(h[src]).trim();
  }

  d.disclaimer = findInfo(info, 'Disclaimer');
  d.customerCareDetails = findInfo(info, 'Customer Care Details');
  d.sellerName = findInfo(info, 'Seller Name');
  d.sellerAddress = findInfo(info, 'Seller Address');
  d.sellerLicenseNo = findInfo(info, 'Seller License No.');
  d.manufacturerOrMarketerName = findInfo(info, 'Manufacturer Or Marketer Name') || findInfo(info, 'Manufactured By');
  d.countryOfOrigin = findInfo(info, 'Country Of Origin');
  d.shelfLife = findInfo(info, 'Shelf Life');

  for (const [k, v] of Object.entries(d)) {
    if (!v || v.length > 200) delete d[k];
  }

  return d;
}

async function login(page: Page) {
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin**', { timeout: 20000 });
  await page.waitForLoadState('load');
}



async function createProduct(page: Page, entry: ProductEntry) {
  const fs = await import('fs');
  const jsonPath = path.join(ZEPTO_DIR, entry.dir, 'product.json');
  if (!fs.existsSync(jsonPath)) { console.log(`SKIP: ${jsonPath} not found`); return; }
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  console.log(`Creating: ${data.name}`);

  await page.goto('/admin/products');
  await page.waitForLoadState('load');
  await page.waitForTimeout(1000);

  // Click Add Product
  await page.locator('button:has-text("Add Product")').click();
  await page.waitForTimeout(1500);

  // Fill basic fields using label text
  await page.getByLabel('Product name').fill(data.name);
  await page.getByLabel('Price').fill(String(data.price?.current || 0));
  await page.getByLabel('Category').selectOption({ index: 1 }); // Select first non-empty category

  // Upload images
  const localImagesDir = path.join(ZEPTO_DIR, entry.dir, 'images');
  if (fs.existsSync(localImagesDir)) {
    const files = fs.readdirSync(localImagesDir).filter((f: string) => /\.(jpe?g|png|webp)$/i.test(f));
    if (files.length > 0) {
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.locator('input[type="file"]').first().click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(files.map((f: string) => path.join(localImagesDir, f)));
      await page.waitForTimeout(3000);
    }
  }

  // Add Zepto CDN images as gallery URLs
  if (data.images && data.images.length > 0) {
    const galleryText = data.images.join('\n');
    await page.getByLabel('Extra gallery image URLs').fill(galleryText);
  }

  // Short description
  await page.getByLabel('Short description').fill(data.name);

  // Build and fill details
  const details = buildDetails(data);
  for (const [key, value] of Object.entries(details)) {
    if (!value) continue;
    const labelMap: Record<string, string> = {
      brand: 'Brand', productType: 'Product type', flavour: 'Flavour',
      materialTypeFree: 'Material type free', keyFeatures: 'Key features',
      itemForm: 'Item form', ingredients: 'Ingredients',
      allergenInformation: 'Allergen information', fssaiLicense: 'FSSAI license',
      nutritionInformation: 'Nutrition information', dietaryPreference: 'Dietary preference',
      spiceLevel: 'Spice level', cuisineType: 'Cuisine type',
      packagingType: 'Packaging type', storageInstruction: 'Storage instruction',
      isPerishable: 'Is perishable', servingSize: 'Serving size',
      weight: 'Weight', unit: 'Unit',
      disclaimer: 'Disclaimer', customerCareDetails: 'Customer care details',
      sellerName: 'Seller name', sellerAddress: 'Seller address',
      sellerLicenseNo: 'Seller license no.',
      manufacturerOrMarketerName: 'Manufacturer or marketer name',
      countryOfOrigin: 'Country of origin', shelfLife: 'Shelf life',
    };
    const label = labelMap[key];
    if (!label) continue;
    try {
      const field = page.getByLabel(label);
      if (await field.isVisible({ timeout: 2000 }).catch(() => false)) {
        await field.fill(value);
      }
    } catch {}
  }

  // Submit
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);

  // Check for errors
  const errorEl = page.locator('text=Failed to save product');
  if (await errorEl.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`  ✗ Failed to save ${data.name}`);
    return;
  }

  // Set inventory
  await page.goto('/admin/products');
  await page.waitForLoadState('load');
  await page.waitForTimeout(2000);

  // Find the product row and set stock
  const rows = page.locator('tbody tr');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const name = await row.locator('td').nth(1).innerText().catch(() => '');
    if (name.includes(data.name)) {
      const stockInput = row.locator('input[type="number"]');
      if (await stockInput.isVisible()) {
        await stockInput.fill('10');
        await row.locator('button:has-text("Save")').click();
        await page.waitForTimeout(2000);
      }
      break;
    }
  }

  console.log(`  ✓ Created: ${data.name}`);
}

test.describe('Seed Admin Products via UI', () => {
  test('Seed all 10 products from zepto_data', async ({ page }) => {
    test.setTimeout(600000);
    await login(page);
    for (const entry of PRODUCTS) {
      try {
        await createProduct(page, entry);
        await page.waitForTimeout(2000);
      } catch (e: any) {
        console.log(`  ✗ Error: ${e.message}`);
      }
    }
    console.log('\nDone seeding products!');
  });
});
