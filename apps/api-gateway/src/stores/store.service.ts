import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Role } from '@aagam/database';
import { Cache } from 'cache-manager';
import * as bcrypt from 'bcrypt';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { AddStoreProductDto } from './dto/add-store-product.dto';
import { StoreCatalogQueryDto } from './dto/store-catalog-query.dto';
import { grantUserRole } from '../auth/user-roles';

const SAFE_STORE_OWNER_SELECT = {
  id: true,
  name: true,
} as const;

type StoreActor = { id: string; role: Role; roles?: Role[] };

@Injectable()
export class StoreService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  private async invalidateCommerceCache() {
    await Promise.allSettled([
      this.cacheManager.del('all_products'),
      this.cacheManager.del('all_categories'),
    ]);
  }

  private async assertStoreAccess(storeId: string, actor: StoreActor) {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, ownerId: true, deletedAt: true, isActive: true, name: true },
    });
    if (!store || store.deletedAt) throw new NotFoundException('Store not found');
    const effectiveRoles = new Set<Role>([actor.role, ...(actor.roles || [])]);
    if (!effectiveRoles.has(Role.ADMIN) && store.ownerId !== actor.id) {
      throw new ForbiddenException('You can only update inventory for your own stores');
    }
    return store;
  }

  private validateQuantity(quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1_000_000) {
      throw new BadRequestException('Quantity must be a whole number between 0 and 1,000,000');
    }
  }

  private resolveSellingPricePaise(
    sellingPrice: number | null | undefined,
    product: { price: number; pricePaise: number; mrpPaise: number },
  ) {
    if (sellingPrice !== undefined && sellingPrice !== null && (!Number.isFinite(sellingPrice) || sellingPrice < 0)) {
      throw new BadRequestException('Selling price must be zero or greater');
    }
    const sellingPricePaise = sellingPrice === undefined
      ? undefined
      : sellingPrice === null
        ? null
        : Math.round(sellingPrice * 100);
    const mrpPaise = product.mrpPaise || product.pricePaise || Math.round(product.price * 100);
    if (sellingPricePaise !== undefined && sellingPricePaise !== null && mrpPaise > 0 && sellingPricePaise > mrpPaise) {
      throw new BadRequestException('Store selling price cannot exceed Admin MRP');
    }
    return sellingPricePaise;
  }

  async findAll() {
    return prisma.store.findMany({
      where: { deletedAt: null, isActive: true },
      include: {
        owner: { select: SAFE_STORE_OWNER_SELECT },
        inventory: true,
      },
    });
  }

  async getDeliveryZones(includeInactive = false) {
    return prisma.deliveryZone.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createDeliveryZone(nameInput: string) {
    const name = String(nameInput || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2) throw new BadRequestException('Delivery zone name must be at least 2 characters.');
    const last = await prisma.deliveryZone.aggregate({ _max: { sortOrder: true } });
    const baseCode = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'ZONE';
    let code = baseCode;
    for (let suffix = 1; await prisma.deliveryZone.findUnique({ where: { code } }); suffix += 1) {
      code = `${baseCode.slice(0, 40)}-${suffix}`;
    }
    try {
      return await prisma.deliveryZone.create({ data: { name, code, sortOrder: (last._max.sortOrder || 0) + 1 } });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('A delivery zone with this name already exists.');
      throw error;
    }
  }

  async updateDeliveryZone(id: string, data: { name?: string; isActive?: boolean }) {
    const existing = await prisma.deliveryZone.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Delivery zone not found');
    const name = data.name === undefined ? undefined : String(data.name).trim().replace(/\s+/g, ' ');
    if (name !== undefined && name.length < 2) throw new BadRequestException('Delivery zone name must be at least 2 characters.');
    return prisma.deliveryZone.update({ where: { id }, data: { ...(name !== undefined ? { name } : {}), ...(data.isActive !== undefined ? { isActive: data.isActive } : {}) } });
  }

  async reorderDeliveryZones(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length || uniqueIds.length !== ids.length) throw new BadRequestException('Provide a unique ordered delivery zone id list.');
    const count = await prisma.deliveryZone.count({ where: { id: { in: uniqueIds } } });
    if (count !== uniqueIds.length) throw new BadRequestException('One or more delivery zones do not exist.');
    await prisma.$transaction(uniqueIds.map((id, index) => prisma.deliveryZone.update({ where: { id }, data: { sortOrder: index + 1 } })) as any);
    return this.getDeliveryZones(true);
  }

  async findByOwnerId(ownerId: string) {
    return prisma.store.findMany({
      where: { ownerId, deletedAt: null },
      include: {
        inventory: { include: { product: { include: { category: true } } } },
        orders: {
          include: {
            customer: { select: { id: true, name: true, email: true } },
            items: { include: { product: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async getStoreAssortment(storeId: string, actor: StoreActor) {
    await this.assertStoreAccess(storeId, actor);
    return prisma.inventory.findMany({
      where: { storeId },
      include: { product: { include: { category: true } } },
      orderBy: [{ product: { category: { name: 'asc' } } }, { product: { name: 'asc' } }],
    });
  }

  async getAvailableCatalogue(storeId: string, actor: StoreActor, query: StoreCatalogQueryDto) {
    await this.assertStoreAccess(storeId, actor);
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 24));
    const search = String(query.search || '').trim();
    const existing = await prisma.inventory.findMany({ where: { storeId }, select: { productId: true } });
    const carriedProductIds = existing.map((row) => row.productId);
    const where: any = {
      isActive: true,
      deletedAt: null,
      ...(carriedProductIds.length ? { id: { notIn: carriedProductIds } } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: { category: true },
        orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.product.count({ where }),
    ]);
    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async addStoreProduct(storeId: string, data: AddStoreProductDto, actor: StoreActor) {
    await this.assertStoreAccess(storeId, actor);
    this.validateQuantity(data.openingQuantity);
    const product = await prisma.product.findFirst({
      where: { id: data.productId, isActive: true, deletedAt: null },
      select: { id: true, price: true, pricePaise: true, mrpPaise: true },
    });
    if (!product) throw new NotFoundException('Active product not found');
    const sellingPricePaise = this.resolveSellingPricePaise(data.sellingPrice, product);
    const existing = await prisma.inventory.findUnique({
      where: { storeId_productId: { storeId, productId: data.productId } },
    });
    if (existing) throw new ConflictException('Product is already part of this store assortment');

    const inventory = await prisma.$transaction(async (tx) => {
      const created = await tx.inventory.create({
        data: {
          storeId,
          productId: data.productId,
          quantity: data.openingQuantity,
          isListed: data.isListed ?? true,
          autoHideWhenOutOfStock: data.autoHideWhenOutOfStock ?? true,
          sellingPricePaise: sellingPricePaise ?? null,
        },
        include: { product: { include: { category: true } } },
      });
      await tx.inventoryLedger.create({
        data: {
          storeId,
          productId: data.productId,
          reason: 'OPENING_STOCK',
          quantityDelta: data.openingQuantity,
          previousQuantity: 0,
          newQuantity: data.openingQuantity,
          actorUserId: actor.id,
          note: `Product added to store assortment with ${data.openingQuantity} opening units`,
        },
      });
      return created;
    });
    await this.invalidateCommerceCache();
    return inventory;
  }

  async findAllAdmin() {
    return prisma.store.findMany({
      where: {},
      include: {
        owner: { select: { id: true, name: true, email: true, phone: true } },
        inventory: true,
      },
      orderBy: [{ deletedAt: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
    });
  }

  async restore(id: string) {
    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) throw new NotFoundException('Store not found');
    if (!store.deletedAt) throw new BadRequestException('Store is not deleted');

    const [restored] = await prisma.$transaction([
      prisma.store.update({
        where: { id },
        data: { deletedAt: null, isActive: true },
      }),
      prisma.user.update({
        where: { id: store.ownerId },
        data: { isActive: true, deactivatedAt: null, deactivationReason: null },
      }),
    ]);
    await this.invalidateCommerceCache();
    return restored;
  }

  async findOne(id: string) {
    const store = await prisma.store.findUnique({
      where: { id, deletedAt: null },
      include: {
        owner: { select: SAFE_STORE_OWNER_SELECT },
        inventory: { include: { product: true } },
      },
    });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async getStoreOrders(storeId: string, actor: StoreActor) {
    await this.assertStoreAccess(storeId, actor);
    return prisma.order.findMany({
      where: { storeId },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        items: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: CreateStoreDto) {
    const ownerEmail = data.ownerEmail.trim().toLowerCase();
    const ownerPhone = data.ownerPhone.trim();

    const existingEmailUser = await prisma.user.findUnique({ where: { email: ownerEmail } });
    if (existingEmailUser) {
      throw new ConflictException('An account with this email already exists. Please use a different email.');
    }

    const existingPhoneUser = await prisma.user.findUnique({ where: { phone: ownerPhone } });
    if (existingPhoneUser) {
      throw new ConflictException('An account with this phone number already exists. Please use a different phone number.');
    }

    const owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        name: data.ownerName.trim(),
        phone: ownerPhone,
        role: 'STORE_OWNER',
        password: await bcrypt.hash(data.password, 10),
      },
    });
    await grantUserRole(prisma as any, owner.id, Role.STORE_OWNER, 'ADMIN_STORE_CREATION');

    const store = await prisma.store.create({
      data: {
        name: data.name.trim(),
        address: data.address.trim(),
        latitude: data.latitude,
        longitude: data.longitude,
        ownerId: owner.id,
      },
    });
    await this.invalidateCommerceCache();
    return store;
  }

  async update(id: string, data: UpdateStoreDto) {
    const updateData: {
      name?: string;
      address?: string;
      latitude?: number;
      longitude?: number;
      isActive?: boolean;
    } = {};

    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.address !== undefined) updateData.address = data.address.trim();
    if (data.latitude !== undefined) updateData.latitude = data.latitude;
    if (data.longitude !== undefined) updateData.longitude = data.longitude;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No supported store fields were provided');
    }

    if (data.isActive === true) {
      const existing = await prisma.store.findUnique({
        where: { id },
        select: { ownerId: true },
      });
      if (existing) {
        await prisma.user.update({
          where: { id: existing.ownerId },
          data: { isActive: true, deactivatedAt: null, deactivationReason: null },
        });
      }
    }

    const store = await prisma.store.update({
      where: { id },
      data: updateData,
    });
    await this.invalidateCommerceCache();
    return store;
  }

  async delete(id: string) {
    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) throw new NotFoundException('Store not found');

    const [deleted] = await prisma.$transaction([
      prisma.store.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      }),
      prisma.user.update({
        where: { id: store.ownerId },
        data: { isActive: false, deactivatedAt: new Date(), deactivationReason: 'Store deleted by admin' },
      }),
    ]);
    await this.invalidateCommerceCache();
    return deleted;
  }

  async updateInventory(
    storeId: string,
    productId: string,
    quantity: number,
    actor?: StoreActor,
    policy?: { isListed?: boolean; autoHideWhenOutOfStock?: boolean; sellingPrice?: number | null },
  ) {
    this.validateQuantity(quantity);
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { pricePaise: true, price: true, mrpPaise: true } });
    if (!product) throw new NotFoundException('Product not found');
    const sellingPricePaise = this.resolveSellingPricePaise(policy?.sellingPrice, product);
    if (actor) await this.assertStoreAccess(storeId, actor);

    return prisma.$transaction(async (tx) => {
      const existing = await tx.inventory.findUnique({
        where: { storeId_productId: { storeId, productId } },
      });
      const previousQuantity = existing?.quantity ?? 0;

      const inventory = await tx.inventory.upsert({
        where: { storeId_productId: { storeId, productId } },
        update: {
          quantity,
          ...(policy?.isListed !== undefined ? { isListed: policy.isListed } : {}),
          ...(policy?.autoHideWhenOutOfStock !== undefined
            ? { autoHideWhenOutOfStock: policy.autoHideWhenOutOfStock }
            : {}),
          ...(sellingPricePaise !== undefined ? { sellingPricePaise } : {}),
        },
        create: {
          storeId,
          productId,
          quantity,
          isListed: policy?.isListed ?? true,
          autoHideWhenOutOfStock: policy?.autoHideWhenOutOfStock ?? true,
          sellingPricePaise: sellingPricePaise ?? null,
        },
      });

      await tx.inventoryLedger.create({
        data: {
          storeId,
          productId,
          reason: 'MANUAL_ADJUSTMENT',
          quantityDelta: quantity - previousQuantity,
          previousQuantity,
          newQuantity: quantity,
          actorUserId: actor?.id ?? null,
          note: `Manual adjustment: ${previousQuantity} -> ${quantity}`,
        },
      });

      await this.invalidateCommerceCache();
      return inventory;
    });
  }
}
