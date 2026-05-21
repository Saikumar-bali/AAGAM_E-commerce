import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { prisma } from '@aagam/database';
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
      include: { owner: true, inventory: true },
    });
  }

  async findByOwnerId(ownerId: string) {
    return prisma.store.findMany({
      where: { ownerId },
      include: { inventory: { include: { product: true } } },
    });
  }

  async findOne(id: string) {
    return prisma.store.findUnique({
      where: { id },
      include: { owner: true, inventory: { include: { product: true } } },
    });
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
    // 1. Delete inventory first
    await prisma.inventory.deleteMany({
      where: { storeId: id },
    });
    
    // 2. Delete OrderItems for all orders belonging to this store
    // This resolves the foreign key constraint violation
    await prisma.orderItem.deleteMany({
      where: {
        order: {
          storeId: id
        }
      }
    });

    // 3. Delete orders related to the store
    await prisma.order.deleteMany({
      where: { storeId: id },
    });

    // 4. Finally delete the store
    const deleted = await prisma.store.delete({
      where: { id },
    });
    await this.invalidateCommerceCache();
    return deleted;
  }

  async updateInventory(storeId: string, productId: string, quantity: number) {
    const inventory = await prisma.inventory.upsert({
      where: {
        storeId_productId: { storeId, productId },
      },
      update: { quantity },
      create: { storeId, productId, quantity },
    });
    await this.invalidateCommerceCache();
    return inventory;
  }
}
