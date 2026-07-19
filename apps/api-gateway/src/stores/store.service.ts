import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Role } from '@aagam/database';
import { Cache } from 'cache-manager';
import * as bcrypt from 'bcrypt';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

const SAFE_STORE_OWNER_SELECT = {
  id: true,
  name: true,
} as const;

@Injectable()
export class StoreService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  private async invalidateCommerceCache() {
    await Promise.allSettled([
      this.cacheManager.del('all_products'),
      this.cacheManager.del('all_categories'),
    ]);
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
    try {
      return await prisma.deliveryZone.create({ data: { name, sortOrder: (last._max.sortOrder || 0) + 1 } });
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
        inventory: { include: { product: true } },
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

  async getStoreOrders(storeId: string, actor: { id: string; role: Role }) {
    if (actor.role === Role.STORE_OWNER) {
      const store = await prisma.store.findUnique({ where: { id: storeId } });
      if (!store || store.ownerId !== actor.id) {
        throw new ForbiddenException('You can only view orders for your own stores');
      }
    }
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
    let owner = await prisma.user.findUnique({ where: { email: ownerEmail } });

    if (!owner) {
      const userData: any = {
        email: ownerEmail,
        name: ownerEmail.split('@')[0],
        role: 'STORE_OWNER',
      };
      if (data.password) {
        userData.password = await bcrypt.hash(data.password, 10);
      }
      owner = await prisma.user.create({ data: userData });
    } else if (data.password && owner.id) {
      await prisma.user.update({
        where: { id: owner.id },
        data: { password: await bcrypt.hash(data.password, 10) },
      });
    }

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

    const deleted = await prisma.store.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.invalidateCommerceCache();
    return deleted;
  }

  async updateInventory(storeId: string, productId: string, quantity: number, actor?: { id: string; role: Role }) {
    if (actor?.role === Role.STORE_OWNER) {
      const store = await prisma.store.findUnique({ where: { id: storeId } });
      if (!store) throw new NotFoundException('Store not found');
      if (store.ownerId !== actor.id) {
        throw new ForbiddenException('You can only update inventory for your own stores');
      }
    }

    return prisma.$transaction(async (tx) => {
      const existing = await tx.inventory.findUnique({
        where: { storeId_productId: { storeId, productId } },
      });
      const previousQuantity = existing?.quantity ?? 0;

      const inventory = await tx.inventory.upsert({
        where: { storeId_productId: { storeId, productId } },
        update: { quantity },
        create: { storeId, productId, quantity },
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
