import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, prisma } from '@aagam/database';
import { UpdateOwnedStoreProfileDto } from './dto/update-owned-store-profile.dto';

@Injectable()
export class StoreOwnerService {
  private async assertOwnedStore(storeId: string, ownerId: string) {
    const store = await prisma.store.findFirst({
      where: { id: storeId, ownerId, deletedAt: null },
      select: { id: true },
    });
    if (!store) throw new NotFoundException('Store not found for this owner');
  }

  async listDashboardStores(ownerId: string) {
    const stores = await prisma.store.findMany({
      where: { ownerId, deletedAt: null },
      select: {
        id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { orders: true, inventory: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { phone: true },
    });
    const storeIds = stores.map((store) => store.id);
    const revenueRows = storeIds.length
      ? await prisma.order.groupBy({
          by: ['storeId'],
          where: { storeId: { in: storeIds }, status: OrderStatus.DELIVERED },
          _sum: { grandTotalPaise: true },
        })
      : [];
    const revenueByStore = new Map(
      revenueRows.map((row) => [row.storeId, Number(row._sum.grandTotalPaise || 0)]),
    );

    return stores.map((store) => {
      const totalRevenuePaise = revenueByStore.get(store.id) || 0;
      return {
        ...store,
        phone: owner?.phone || '',
        orderCount: store._count.orders,
        inventoryCount: store._count.inventory,
        totalRevenuePaise,
        totalRevenue: totalRevenuePaise / 100,
      };
    });
  }

  async updateOwnedProfile(storeId: string, ownerId: string, data: UpdateOwnedStoreProfileDto) {
    await this.assertOwnedStore(storeId, ownerId);
    const phone = data.phone.trim();
    const alternatePhone = `+91${phone}`;
    const conflictingUser = await prisma.user.findFirst({
      where: {
        id: { not: ownerId },
        phone: { in: [phone, alternatePhone] },
      },
      select: { id: true },
    });
    if (conflictingUser) {
      throw new ConflictException('That phone number already belongs to another account');
    }

    await prisma.$transaction([
      prisma.store.update({
        where: { id: storeId },
        data: { name: data.name.trim(), address: data.address.trim() },
      }),
      prisma.user.update({
        where: { id: ownerId },
        data: { phone },
      }),
    ]);

    const stores = await this.listDashboardStores(ownerId);
    return stores.find((store) => store.id === storeId);
  }
}
