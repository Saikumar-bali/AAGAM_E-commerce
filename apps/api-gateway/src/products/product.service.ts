import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { getProductImage, calculateDistance } from '@aagam/utils';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { QueryProductsDto } from './dto/query-products.dto';

const haversineKm = calculateDistance;
type ProductDetails = Record<string, unknown>;
type ProductWriteData = {
  name?: string;
  description?: string | null;
  price?: number;
  mrp?: number;
  categoryId?: string;
  image?: string | null;
  images?: unknown;
  details?: ProductDetails | null;
  isActive?: boolean;
  sortOrder?: number;
};

function computeServiceable(distanceKm: number | null): boolean | null {
  if (distanceKm === null || !Number.isFinite(distanceKm)) return null;
  return distanceKm <= 8;
}

function cleanCategoryName(name: string) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function cleanStringList(value?: unknown): string[] {
  const rows = Array.isArray(value) ? value : String(value || '').split(/[\n,]+/);
  return Array.from(new Set(rows.map((item) => String(item || '').trim()).filter(Boolean)));
}

function cleanProductDetails(details?: ProductDetails | null) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const cleaned = Object.entries(details).reduce<ProductDetails>((acc, [key, value]) => {
    if (typeof value === 'string') {
      const nextValue = value.trim();
      if (nextValue) acc[key] = nextValue;
    } else if (Array.isArray(value)) {
      const nextValues = cleanStringList(value);
      if (nextValues.length) acc[key] = nextValues;
    } else if (value !== undefined && value !== null && value !== '') {
      acc[key] = value;
    }
    return acc;
  }, {});
  return Object.keys(cleaned).length ? cleaned : null;
}

function cleanProductImages(images?: unknown, primaryImage?: string | null) {
  return cleanStringList([primaryImage, ...cleanStringList(images)]).filter(Boolean);
}

@Injectable()
export class ProductService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  private withFallbackImages<T extends { id?: string | null; name?: string | null; image?: string | null; category?: { name?: string | null } | null }>(products: T[]) {
    return products.map((product) => ({ ...product, image: getProductImage(product) }));
  }

  private async clearProductCache(productId?: string) {
    await this.cacheManager.del('all_products');
    if (productId) await this.cacheManager.del(`product_${productId}`);
  }

  private async resolveAvailabilityContext(query: QueryProductsDto, userId?: string) {
    let lat = query.lat ?? null;
    let lng = query.lng ?? null;
    if (query.addressId) {
      const address = await prisma.customerAddress.findFirst({ where: userId ? { id: query.addressId, userId } : { id: query.addressId }, select: { latitude: true, longitude: true } });
      if (address) { lat = address.latitude; lng = address.longitude; }
    }
    if (query.storeId) {
      const store = await prisma.store.findFirst({ where: { id: query.storeId, isActive: true, deletedAt: null }, select: { id: true, name: true, latitude: true, longitude: true } });
      if (!store) return null;
      const distanceKm = lat !== null && lng !== null ? haversineKm(lat, lng, store.latitude, store.longitude) : null;
      return { storeId: store.id, storeName: store.name, distanceKm, serviceable: computeServiceable(distanceKm) };
    }
    if (lat === null || lng === null) return null;
    const stores = await prisma.store.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true, latitude: true, longitude: true } });
    if (!stores.length) return null;
    let best = stores[0];
    let bestDistance = haversineKm(lat, lng, best.latitude, best.longitude);
    for (const store of stores.slice(1)) {
      const distance = haversineKm(lat, lng, store.latitude, store.longitude);
      if (distance < bestDistance) { best = store; bestDistance = distance; }
    }
    return { storeId: best.id, storeName: best.name, distanceKm: bestDistance, serviceable: computeServiceable(bestDistance) };
  }

  private async attachAvailability<T extends { id: string }>(products: T[], query: QueryProductsDto, userId?: string) {
    const shouldAttach = Boolean(query.includeAvailability || query.addressId || query.storeId || (query.lat != null && query.lng != null));
    if (!products.length || !shouldAttach) return products;
    const context = await this.resolveAvailabilityContext(query, userId);
    if (!context?.storeId) {
      // Availability cannot be decided until a delivery address or store is
      // known. Treating an unknown store as zero stock disabled Add to Cart on
      // every product detail page. Checkout still performs the authoritative
      // inventory check for the selected address.
      return products.map((product) => ({ ...product, availability: { storeId: null, storeName: null, availableQty: null, inStock: null, availabilityKnown: false, serviceable: context?.serviceable ?? null, distanceKm: context?.distanceKm ?? null } }));
    }
    const inventory = await prisma.inventory.findMany({ where: { storeId: context.storeId, productId: { in: products.map((product) => product.id) } }, select: { productId: true, quantity: true, isListed: true, autoHideWhenOutOfStock: true, sellingPricePaise: true } });
    const inventoryMap = new Map(inventory.map((item) => [item.productId, item]));
    return products.map((product) => {
      const inventoryRow = inventoryMap.get(product.id);
      const availableQty = inventoryRow?.quantity ?? 0;
      const isVisible = Boolean(
        inventoryRow?.isListed &&
        !(inventoryRow.autoHideWhenOutOfStock && availableQty === 0)
      );
      const basePaise = Number((product as any).pricePaise) || Math.round(Number((product as any).price || 0) * 100);
      const effectivePricePaise = inventoryRow?.sellingPricePaise ?? basePaise;
      const mrpPaise = Math.max(Number((product as any).mrpPaise) || basePaise, effectivePricePaise);
      return { ...product, price: effectivePricePaise / 100, pricePaise: effectivePricePaise, mrpPaise, discountPaise: Math.max(0, mrpPaise - effectivePricePaise), discountPercent: mrpPaise > 0 ? Math.round(((mrpPaise - effectivePricePaise) * 100) / mrpPaise) : 0, availability: { storeId: context.storeId, storeName: context.storeName, availableQty, inStock: availableQty > 0, isVisible, autoHideWhenOutOfStock: inventoryRow?.autoHideWhenOutOfStock ?? true, availabilityKnown: true, serviceable: context.serviceable, distanceKm: context.distanceKm } };
    });
  }

  async findAll(query: QueryProductsDto = {}, userId?: string) {
    const shouldUseCache = !query.search && !query.categoryId && !query.sort && !query.page && !query.pageSize && !query.addressId && !query.storeId && query.lat == null && query.lng == null && !query.includeAvailability;
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
    if (query.search) where.OR = [{ name: { contains: query.search, mode: 'insensitive' } }, { description: { contains: query.search, mode: 'insensitive' } }];
    const orderBy: any = query.sort === 'price_asc' ? { price: 'asc' } : query.sort === 'price_desc' ? { price: 'desc' } : query.sort === 'name_asc' ? { name: 'asc' } : query.sort === 'name_desc' ? { name: 'desc' } : [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { createdAt: 'desc' }];
    const [products, total] = await Promise.all([
      prisma.product.findMany({ where, include: { category: true }, orderBy, ...(paginate ? { skip: (page - 1) * pageSize, take: pageSize } : {}) }),
      paginate ? prisma.product.count({ where }) : Promise.resolve(0),
    ]);
    const productsWithImages = this.withFallbackImages(products);
    const enrichedProducts = await this.attachAvailability(productsWithImages, query, userId);
    if (shouldUseCache) { await this.cacheManager.set(cacheKey, enrichedProducts, 600000); return enrichedProducts; }
    if (!paginate) return enrichedProducts;
    return { items: enrichedProducts, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findAdminAll() {
    return prisma.product.findMany({
      where: { deletedAt: null },
      include: { category: true },
      orderBy: [{ isActive: 'desc' }, { category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string, query: QueryProductsDto = {}, userId?: string) {
    const shouldUseCache = !query.addressId && !query.storeId && query.lat == null && query.lng == null && !query.includeAvailability;
    const cacheKey = `product_${id}`;
    if (shouldUseCache) {
      const cachedProduct = await this.cacheManager.get(cacheKey);
      if (cachedProduct) return cachedProduct;
    }
    const product = await prisma.product.findUnique({ where: { id, deletedAt: null, isActive: true }, include: { category: true } });
    if (!product) throw new NotFoundException('Product not found');
    const [enrichedProduct] = await this.attachAvailability(this.withFallbackImages([product]), query, userId);
    if (shouldUseCache) await this.cacheManager.set(cacheKey, enrichedProduct, 600000);
    return enrichedProduct;
  }

  async getSubstitutes(id: string, query: QueryProductsDto = {}, userId?: string) {
    const product = await prisma.product.findUnique({ where: { id, deletedAt: null, isActive: true }, select: { id: true, categoryId: true } });
    if (!product) throw new NotFoundException('Product not found');
    const context = await this.resolveAvailabilityContext(query, userId);
    const storeId = context?.storeId ?? null;
    if (!storeId) return [];
    const substitutes = await prisma.product.findMany({
      where: { id: { not: id }, categoryId: product.categoryId, deletedAt: null, isActive: true, inventory: { some: { storeId, quantity: { gt: 0 } } } },
      include: { category: true, inventory: { where: { storeId }, select: { quantity: true, storeId: true }, take: 1 } },
      orderBy: [{ name: 'asc' }],
      take: 8,
    });
    return this.withFallbackImages(substitutes).map((substitute: any) => {
      const inventory = substitute.inventory?.[0];
      const { inventory: _inventory, ...rest } = substitute;
      const availableQty = inventory?.quantity ?? 0;
      return { ...rest, availability: { storeId, availableQty, inStock: availableQty > 0, serviceable: context?.serviceable ?? null, distanceKm: context?.distanceKm ?? null } };
    });
  }

  async create(data: Required<Pick<ProductWriteData, 'name' | 'price' | 'categoryId'>> & ProductWriteData) {
    const sellingPaise = Math.round(Number(data.price) * 100);
    const mrpPaise = Math.round(Number(data.mrp ?? data.price) * 100);
    if (!Number.isFinite(sellingPaise) || sellingPaise < 0 || !Number.isFinite(mrpPaise) || mrpPaise < sellingPaise) throw new BadRequestException('MRP must be greater than or equal to the selling price.');
    const images = cleanProductImages(data.images, data.image ?? null);
    const lastProduct = await prisma.product.aggregate({ where: { categoryId: data.categoryId, deletedAt: null }, _max: { sortOrder: true } });
    const product = await prisma.product.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        price: data.price,
        pricePaise: sellingPaise,
        mrpPaise,
        categoryId: data.categoryId,
        image: data.image || images[0] || null,
        images: images.length ? images as any : undefined,
        details: cleanProductDetails(data.details) as any,
        isActive: data.isActive ?? true,
        sortOrder: (lastProduct._max.sortOrder || 0) + 1,
      },
    });
    await this.clearProductCache();
    return product;
  }

  async getCategories() {
    const cacheKey = 'all_categories';
    const cachedCategories = await this.cacheManager.get(cacheKey);
    if (cachedCategories) return cachedCategories;
    const categories = await prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    await this.cacheManager.set(cacheKey, categories, 3600000);
    return categories;
  }

  async createCategory(name: string) {
    const cleanName = cleanCategoryName(name);
    if (cleanName.length < 2) throw new BadRequestException('Category name must be at least 2 characters.');
    try {
      const lastCategory = await prisma.category.aggregate({ _max: { sortOrder: true } });
      const category = await prisma.category.create({ data: { name: cleanName, sortOrder: (lastCategory._max.sortOrder || 0) + 1 } });
      await this.cacheManager.del('all_categories');
      await this.clearProductCache();
      return category;
    } catch (error: any) {
      if (error?.code === 'P2002' && error?.meta?.target?.includes('name')) {
        throw new ConflictException(`Category '${cleanName}' already exists`);
      }
      throw error;
    }
  }

  async updateCategory(id: string, name: string) {
    const cleanName = cleanCategoryName(name);
    if (cleanName.length < 2) throw new BadRequestException('Category name must be at least 2 characters.');
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');
    const updated = await prisma.category.update({ where: { id }, data: { name: cleanName } });
    await this.cacheManager.del('all_categories');
    await this.clearProductCache();
    return updated;
  }

  async deleteCategory(id: string) {
    const existing = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
    if (!existing) throw new NotFoundException('Category not found');
    if (existing._count.products > 0) throw new BadRequestException('Move or delete products in this category before deleting it.');
    const deleted = await prisma.category.delete({ where: { id } });
    await this.cacheManager.del('all_categories');
    await this.clearProductCache();
    return deleted;
  }

  async reorderCategories(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length || uniqueIds.length !== ids.length) throw new BadRequestException('Provide a unique ordered category id list.');
    const count = await prisma.category.count({ where: { id: { in: uniqueIds } } });
    if (count !== uniqueIds.length) throw new BadRequestException('One or more categories do not exist.');
    await prisma.$transaction(uniqueIds.map((id, index) => prisma.category.update({ where: { id }, data: { sortOrder: index + 1 } })) as any);
    await this.cacheManager.del('all_categories');
    await this.clearProductCache();
    return this.getCategories();
  }

  async reorderProducts(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length || uniqueIds.length !== ids.length) throw new BadRequestException('Provide a unique ordered product id list.');
    const selected = await prisma.product.findMany({
      where: { id: { in: uniqueIds }, deletedAt: null },
      select: { id: true, sortOrder: true },
    });
    if (selected.length !== uniqueIds.length) throw new BadRequestException('One or more products do not exist.');
    // A filtered drag operation must only rearrange the occupied slots of the
    // visible products; unrelated products keep their relative position.
    const slots = selected.map((row) => row.sortOrder).sort((a, b) => a - b);
    await prisma.$transaction(uniqueIds.map((id, index) =>
      prisma.product.update({ where: { id }, data: { sortOrder: slots[index] } })
    ) as any);
    await this.clearProductCache();
    return this.findAdminAll();
  }

  async update(id: string, data: ProductWriteData) {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');
    if (data.price !== undefined || data.mrp !== undefined) {
      const selling = data.price ?? existing.price;
      const mrp = data.mrp ?? ((existing as any).mrpPaise || Math.round(existing.price * 100)) / 100;
      if (selling < 0 || mrp < selling) throw new BadRequestException('MRP must be greater than or equal to the selling price.');
    }
    const images = data.images !== undefined ? cleanProductImages(data.images, data.image ?? existing.image) : undefined;
    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.price !== undefined ? { price: data.price, pricePaise: Math.round(data.price * 100) } : {}),
        ...(data.mrp !== undefined ? { mrpPaise: Math.round(data.mrp * 100) } : {}),
        ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
        ...(data.image !== undefined ? { image: data.image || images?.[0] || null } : {}),
        ...(images !== undefined ? { images: images.length ? images as any : [] } : {}),
        ...(data.details !== undefined ? { details: cleanProductDetails(data.details) as any } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
    await this.clearProductCache(id);
    return product;
  }

  async setActive(id: string, isActive: boolean) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product || product.deletedAt) throw new NotFoundException('Product not found');
    const updated = await prisma.product.update({ where: { id }, data: { isActive } });
    await this.clearProductCache(id);
    return updated;
  }

  async delete(id: string) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    const deleted = await prisma.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await this.clearProductCache(id);
    return deleted;
  }
}
