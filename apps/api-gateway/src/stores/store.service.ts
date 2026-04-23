import { Injectable } from '@nestjs/common';
import { prisma } from '@aagam/database';

@Injectable()
export class StoreService {
  async findAll() {
    return prisma.store.findMany({
      include: { owner: true, inventory: true },
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
    
    return prisma.store.create({
      data: {
        name: data.name,
        address: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
        ownerId: owner.id,
      },
    });
  }

  async update(id: string, data: { name?: string; address?: string; latitude?: number; longitude?: number; isActive?: boolean }) {
    return prisma.store.update({
      where: { id },
      data,
    });
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
    return prisma.store.delete({
      where: { id },
    });
  }

  async updateInventory(storeId: string, productId: string, quantity: number) {
    return prisma.inventory.upsert({
      where: {
        storeId_productId: { storeId, productId },
      },
      update: { quantity },
      create: { storeId, productId, quantity },
    });
  }
}
