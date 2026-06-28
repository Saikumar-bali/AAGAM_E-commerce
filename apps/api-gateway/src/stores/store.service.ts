import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Role } from '@aagam/database';
import { Cache } from 'cache-manager';

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
      include: { owner: true, inventory: true },
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
      include: { owner: true, inventory: { include: { product: true } } },
    });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async create(data: { name: string; address: string; latitude: number; longitude: number; ownerEmail: string }) {
    let owner = await prisma.user.findUnique({ where: { email: data.ownerEmail } });
    
    if (!owner) {
      owner = await prisma.user.create({
        data: {
          email: data.ownerEmail,
          name: data.ownerEmail.split('@')[0],
          role: 'STORE_OWNER',
        },
      });
    }
    
    const store = await prisma.store.create({
      data: {
        name: data.name,
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
        ownerId: owner.id,
      },
    });
    await this.invalidateCommerceCache();
    return store;
  }

  async update(id: string, data: { name?: string; address?: string; latitude?: number; longitude?: number; isActive?: boolean }) {
    const store = await prisma.store.update({
      where: { id },
      data,
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
