import * as fs from 'fs';
import * as path from 'path';
import { validateSync } from 'class-validator';
import { CreateProductDto } from './products/dto/create-product.dto';
import { UpdateProductDto } from './products/dto/update-product.dto';
import { UpdateProductWeightDto } from './products/dto/update-product-weight.dto';

const root = path.resolve(__dirname, '../../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('product routing weight maintenance', () => {
  it('validates routing weights as positive whole grams while remaining optional on general product writes', () => {
    const createWithoutWeight = Object.assign(new CreateProductDto(), {
      name: 'Milk', price: 30, categoryId: 'dairy',
    });
    expect(validateSync(createWithoutWeight).filter((error) => error.property === 'weightGrams')).toHaveLength(0);

    const updateWithWeight = Object.assign(new UpdateProductDto(), { weightGrams: 510 });
    expect(validateSync(updateWithWeight)).toHaveLength(0);

    const invalidUpdate = Object.assign(new UpdateProductDto(), { weightGrams: 0 });
    expect(validateSync(invalidUpdate).some((error) => error.property === 'weightGrams')).toBe(true);

    const dedicated = Object.assign(new UpdateProductWeightDto(), { weightGrams: 510 });
    expect(validateSync(dedicated)).toHaveLength(0);
    const invalidDedicated = Object.assign(new UpdateProductWeightDto(), { weightGrams: 1.5 });
    expect(validateSync(invalidDedicated).some((error) => error.property === 'weightGrams')).toBe(true);
  });

  it('persists general create/update weights and exposes a narrow Admin maintenance endpoint', () => {
    const productController = read('apps/api-gateway/src/products/product.controller.ts');
    const adminController = read('apps/api-gateway/src/products/admin-product.controller.ts');
    const service = read('apps/api-gateway/src/products/product-routing-weight.service.ts');

    expect(productController).toContain('data.weightGrams === undefined');
    expect(productController).toContain('this.routingWeightService.setWeight(product.id, data.weightGrams)');
    expect(adminController).toContain("@Patch(':id/weight')");
    expect(adminController).toContain('UpdateProductWeightDto');
    expect(service).toContain('data: { weightGrams }');
    expect(service).toContain("this.cacheManager.del('all_products')");
    expect(service).toContain('this.cacheManager.del(`product_${productId}`)');
  });

  it('keeps routing weight separate from customer-facing free text and makes missing values actionable in Admin', () => {
    const page = read('apps/admin-dashboard/src/app/(admin)/admin/products/routing-weights/page.tsx');
    const layout = read('apps/admin-dashboard/src/app/(admin)/admin/products/layout.tsx');

    expect(page).toContain('Routing unit weight (grams)');
    expect(page).toContain('displayPackWeight(product)');
    expect(page).toContain('Informational only; not used by routing.');
    expect(page).toContain("apiClient.patch(`/admin/products/${product.id}/weight`, { weightGrams: value })");
    expect(page).toContain('Do not copy volume text');
    expect(layout).toContain("'/admin/products/routing-weights'");
  });

  it('preserves the subscription positive-weight invariant instead of weakening it', () => {
    const plans = read('apps/api-gateway/src/subscriptions/subscription-plan.service.ts');
    const serviceability = read('apps/api-gateway/src/subscriptions/subscription-serviceability.service.ts');
    expect(plans).toContain('weightGrams');
    expect(plans).toContain('positive unit weight');
    expect(serviceability).toContain('weightGrams');
    expect(serviceability).toContain('positive unit weight');
  });
});
