import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { getProductImage } from '@aagam/utils';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { QueryProductsDto } from './dto/query-products.dto';

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function computeServiceable(distanceKm: number | null): boolean | null {
  if (distanceKm === null || !Number.isFinite(distanceKm)) return null;
  return distanceKm <= 8;
}

@Injectable()
export class ProductService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  private withFallbackImages<T extends { id?: string | null; name?: string | null; image?: string | null; category?: { name?: string | null } | null }>(
    products: T[],
  ) {
    return products.map((product) => ({
      ...product,
      image: getProductImage(product),
    }));
  }

  private async resolveAvailabilityContext(query: QueryProductsDto, userId?: string) {
    let lat = query.lat ?? null;
    let lng = query.lng ?? null;

    if (query.addressId && userId) {
      const address = await prisma.customerAddress.findFirst({
        where: { id: query.addressId, userId },
        select: { latitude: true, longitude: true },
      });
      if (address) {
        lat = address.latitude;
        lng = address.longitude;
      }
    }

    if (lat === null || lng === null) {
      return null;
    }

    const stores = await prisma.store.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, latitude: true, longitude: true },
    });
    if (!stores.length) return null;

    let best = stores[0];
    let bestDistance = haversineKm(lat, lng, best.latitude, best.longitude);

    for (const store of stores.slice(1)) {
      const distance = haversineKm(lat, lng, store.latitude, store.longitude);
      if (distance < bestDistance) {
        best = store;
        bestDistance = distance;
      }
    }

    return {
      storeId: best.id,
      storeName: best.name,
      distanceKm: bestDistance,
      serviceable: computeServiceable(bestDistance),
    };
  }

  private async attachAvailability<T extends { id: string }>(
    products: T[],
    query: QueryProductsDto,
    userId?: string,
  ) {
    const shouldAttach = Boolean(query.includeAvailability || query.addressId || (query.lat != null && query.lng != null));
    if (!products.length || !shouldAttach) return products;

    const context = await this.resolveAvailabilityContext(query, userId);
    if (!context?.storeId) {
      return products.map((product) => ({
        ...product,
        availability: {
          storeId: null,
          storeName: null,
          availableQty: null,
          inStock: false,
          serviceable: context?.serviceable ?? null,
          distanceKm: context?.distanceKm ?? null,
        },
      }));
    }

    const inventory = await prisma.inventory.findMany({
      where: {
        storeId: context.storeId,
        productId: { in: products.map((product) => product.id) },
      },
      select: { productId: true, quantity: true },
    });
    const inventoryMap = new Map(inventory.map((item) => [item.productId, item.quantity]));

    return products.map((product) => {
      const availableQty = inventoryMap.get(product.id) ?? 0;
      return {
        ...product,
        availability: {
          storeId: context.storeId,
          storeName: context.storeName,
          availableQty,
          inStock: availableQty > 0,
          serviceable: context.serviceable,
          distanceKm: context.distanceKm,
        },
      };
    });
  }

  async findAll(query: QueryProductsDto = {}, userId?: string) {
    const shouldUseCache =
      !query.search &&
      !query.categoryId &&
      !query.sort &&
      !query.page &&
      !query.pageSize &&
      !query.addressId &&
      query.lat == null &&
      query.lng == null &&
      !query.includeAvailability;

    const cacheKey = 'all_products';
    if (shouldUseCache) {
      const cachedProducts = await this.cacheManager.get(cacheKey);
      if (cachedProducts) return cachedProducts;
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;
    const paginate = Boolean(query.page || query.pageSize);

    const where: any = { deletedAt: null, isActive: true };
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy: any =
      query.sort === 'price_asc'
        ? { price: 'asc' }
        : query.sort === 'price_desc'
          ? { price: 'desc' }
          : query.sort === 'name_asc'
            ? { name: 'asc' }
            : query.sort === 'name_desc'
              ? { name: 'desc' }
              : { createdAt: 'desc' };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { category: true },
        orderBy,
        ...(paginate
          ? {
              skip: (page - 1) * pageSize,
              take: pageSize,
            }
          : {}),
      }),
      paginate ? prisma.product.count({ where }) : Promise.resolve(0),
    ]);

    const productsWithImages = this.withFallbackImages(products);
    const enrichedProducts = await this.attachAvailability(productsWithImages, query, userId);

    if (shouldUseCache) {
      await this.cacheManager.set(cacheKey, enrichedProducts, 600000);
      return enrichedProducts;
    }

    if (!paginate) return enrichedProducts;

    return {
      items: enrichedProducts,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async findOne(id: string, query: QueryProductsDto = {}, userId?: string) {
    const shouldUseCache =
      !query.addressId &&
      query.lat == null &&
      query.lng == null &&
      !query.includeAvailability;

    const cacheKey = `product_${id}`;
    if (shouldUseCache) {
      const cachedProduct = await this.cacheManager.get(cacheKey);
      if (cachedProduct) return cachedProduct;
    }

    const product = await prisma.product.findUnique({
      where: { id, deletedAt: null, isActive: true },
      include: { category: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const [enrichedProduct] = await this.attachAvailability(this.withFallbackImages([product]), query, userId);

    if (shouldUseCache) {
      await this.cacheManager.set(cacheKey, enrichedProduct, 600000);
    }

    return enrichedProduct;
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
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');

    const deleted = await prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.cacheManager.del('all_products');
    await this.cacheManager.del(`product_${id}`);
    return deleted;
  }
}
