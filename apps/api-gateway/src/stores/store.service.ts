import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Role } from '@aagam/database';
import { Cache } from 'cache-manager';
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
      where: { id, deletedAt: null, isActive: true },
      include: {
        owner: { select: SAFE_STORE_OWNER_SELECT },
        inventory: { include: { product: true } },
      },
    });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async create(data: CreateStoreDto) {
    const ownerEmail = data.ownerEmail.trim().toLowerCase();
    let owner = await prisma.user.findUnique({ where: { email: ownerEmail } });

    if (!owner) {
      owner = await prisma.user.create({
        data: {
          email: ownerEmail,
          name: ownerEmail.split('@')[0],
          role: 'STORE_OWNER',
        },
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
