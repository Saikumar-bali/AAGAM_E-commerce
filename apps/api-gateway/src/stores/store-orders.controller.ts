import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrderStatus, prisma, Role } from '@aagam/database';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

const ORDER_INCLUDE = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  items: { include: { product: true } },
  deliveryJob: {
    include: {
      currentRider: {
        include: { user: { select: { id: true, name: true, phone: true } } },
      },
    },
  },
} as const;

@Controller('store-owner/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STORE_OWNER, Role.ADMIN)
export class StoreOrdersController {
  private async assertAccess(storeId: string, actor: { id: string; role: Role; roles?: Role[] }) {
    const store = await prisma.store.findFirst({
      where: { id: storeId, deletedAt: null },
      select: { id: true, ownerId: true },
    });
    if (!store) throw new NotFoundException('Store not found');
    const roles = new Set<Role>([actor.role, ...(actor.roles || [])]);
    if (!roles.has(Role.ADMIN) && store.ownerId !== actor.id) {
      throw new ForbiddenException('You can only view orders for your own store');
    }
  }

  @Get(':storeId')
  async list(
    @Param('storeId') storeId: string,
    @Query('page') rawPage: string | undefined,
    @Query('pageSize') rawPageSize: string | undefined,
    @Query('search') rawSearch: string | undefined,
    @Query('status') rawStatus: string | undefined,
    @Req() req: any,
  ) {
    await this.assertAccess(storeId, req.user);
    const page = Math.max(1, Number(rawPage) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(rawPageSize) || 20));
    const search = String(rawSearch || '').trim();
    const statuses = String(rawStatus || '')
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    const invalidStatus = statuses.find((status) => !Object.values(OrderStatus).includes(status as OrderStatus));
    if (invalidStatus) throw new BadRequestException(`Unsupported order status filter: ${invalidStatus}`);

    const searchWhere = search
      ? {
          OR: [
            { id: { contains: search, mode: 'insensitive' as const } },
            { customer: { name: { contains: search, mode: 'insensitive' as const } } },
            { customer: { email: { contains: search, mode: 'insensitive' as const } } },
            { customer: { phone: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {};
    const where: any = {
      storeId,
      ...(statuses.length ? { status: { in: statuses as OrderStatus[] } } : {}),
      ...searchWhere,
    };
    const countsWhere: any = { storeId, ...searchWhere };

    const [items, total, grouped] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.order.count({ where }),
      prisma.order.groupBy({
        by: ['status'],
        where: countsWhere,
        _count: { _all: true },
      }),
    ]);
    const statusCounts = Object.fromEntries(
      grouped.map((entry) => [entry.status, entry._count._all]),
    );

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      statusCounts,
    };
  }

  @Get(':storeId/:orderId')
  async detail(
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Req() req: any,
  ) {
    await this.assertAccess(storeId, req.user);
    const order = await prisma.order.findFirst({
      where: { id: orderId, storeId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException('Order not found for this store');
    return order;
  }
}
