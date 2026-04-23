import { Injectable, Inject } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class ProductService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async findAll() {
    const cacheKey = 'all_products';
    const cachedProducts = await this.cacheManager.get(cacheKey);
    if (cachedProducts) return cachedProducts;

    const products = await prisma.product.findMany({
      include: { category: true },
    });
    
    await this.cacheManager.set(cacheKey, products, 600000); // 10 mins
    return products;
  }

  async findOne(id: string) {
    const cacheKey = `product_${id}`;
    const cachedProduct = await this.cacheManager.get(cacheKey);
    if (cachedProduct) return cachedProduct;

    const product = await prisma.product.findUnique({
      where: { id },
      include: { category: true },
    });

    if (product) {
      await this.cacheManager.set(cacheKey, product, 600000);
    }
    return product;
  }

  async create(data: { name: string; description?: string; price: number; categoryId: string; image?: string }) {
    try {
      const product = await prisma.product.create({
        data,
      });
      await this.cacheManager.del('all_products'); // Invalidate cache
      return product;
    } catch (error) {
      console.error('[PRODUCT SERVICE] Error creating product:', error);
      throw error;
    }
  }

  async getCategories() {
    const cacheKey = 'all_categories';
    const cachedCategories = await this.cacheManager.get(cacheKey);
    if (cachedCategories) return cachedCategories;

    const categories = await prisma.category.findMany();
    await this.cacheManager.set(cacheKey, categories, 3600000); // 1 hour
    return categories;
  }

  async createCategory(name: string) {
    const category = await prisma.category.create({
      data: { name },
    });
    await this.cacheManager.del('all_categories');
    return category;
  }

  async update(id: string, data: { name?: string; description?: string | null; price?: number; categoryId?: string; image?: string | null }) {
    const product = await prisma.product.update({
      where: { id },
      data,
    });
    await this.cacheManager.del('all_products');
    await this.cacheManager.del(`product_${id}`);
    return product;
  }

  async delete(id: string) {
    await prisma.inventory.deleteMany({
      where: { productId: id },
    });
    await prisma.orderItem.deleteMany({
      where: { productId: id },
    });
    const product = await prisma.product.delete({
      where: { id },
    });
    await this.cacheManager.del('all_products');
    await this.cacheManager.del(`product_${id}`);
    return product;
  }
}
