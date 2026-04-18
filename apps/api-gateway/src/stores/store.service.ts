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
