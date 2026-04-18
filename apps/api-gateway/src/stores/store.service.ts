import { Injectable } from '@nestjs/common';
import { prisma } from '@aagam/database';

@Injectable()
export class StoreService {
  async findAll() {
    return prisma.store.findMany({
      include: { owner: true },
    });
  }

  async findOne(id: string) {
    return prisma.store.findUnique({
      where: { id },
      include: { owner: true, inventory: { include: { product: true } } },
    });
  }

  async create(data: { name: string; address: string; latitude: number; longitude: number; ownerId: string }) {
    return prisma.store.create({
      data,
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
