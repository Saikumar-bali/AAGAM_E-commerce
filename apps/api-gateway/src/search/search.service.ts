import { BadRequestException, Injectable } from '@nestjs/common';
import { Role, prisma } from '@aagam/database';

type Actor = { id: string; role: Role; roles?: Role[] };
type Result = { id: string; type: string; title: string; subtitle: string; href: string };

@Injectable()
export class GlobalSearchService {
  async search(actor: Actor, input: string) {
    const q = input.trim();
    if (q.length < 2) throw new BadRequestException('Enter at least 2 characters');
    const contains = { contains: q, mode: 'insensitive' as const };
    const roles = new Set([actor.role, ...(actor.roles || [])]);
    const results: Result[] = [];

    if (roles.has(Role.ADMIN)) {
      const [orders, products, stores, riders] = await Promise.all([
        prisma.order.findMany({ where: { OR: [{ id: contains }, { customer: { name: contains } }] }, select: { id: true, status: true, customer: { select: { name: true } } }, take: 8 }),
        prisma.product.findMany({ where: { deletedAt: null, OR: [{ name: contains }, { category: { name: contains } }] }, select: { id: true, name: true, category: { select: { name: true } } }, take: 8 }),
        prisma.store.findMany({ where: { deletedAt: null, OR: [{ name: contains }, { address: contains }] }, select: { id: true, name: true, address: true }, take: 8 }),
        prisma.riderProfile.findMany({ where: { OR: [{ user: { name: contains } }, { user: { phone: contains } }] }, select: { id: true, status: true, user: { select: { name: true, phone: true } } }, take: 8 }),
      ]);
      results.push(
        ...orders.map((row) => ({ id: row.id, type: 'Order', title: `Order ${row.id.slice(0, 8)}`, subtitle: `${row.customer?.name || 'Customer'} · ${row.status}`, href: `/admin/orders?orderId=${row.id}` })),
        ...products.map((row) => ({ id: row.id, type: 'Product', title: row.name, subtitle: row.category?.name || 'Uncategorized', href: `/admin/products?productId=${row.id}` })),
        ...stores.map((row) => ({ id: row.id, type: 'Store', title: row.name, subtitle: row.address, href: `/admin/stores?storeId=${row.id}` })),
        ...riders.map((row) => ({ id: row.id, type: 'Rider', title: row.user?.name || 'Rider', subtitle: `${row.user?.phone || 'No phone'} · ${row.status}`, href: `/admin/riders?riderId=${row.id}` })),
      );
    } else if (roles.has(Role.STORE_OWNER)) {
      const stores = await prisma.store.findMany({ where: { ownerId: actor.id, deletedAt: null }, select: { id: true, name: true } });
      const storeIds = stores.map((row) => row.id);
      const orders = await prisma.order.findMany({ where: { storeId: { in: storeIds }, OR: [{ id: contains }, { customer: { name: contains } }] }, select: { id: true, status: true, customer: { select: { name: true } } }, take: 15 });
      results.push(...stores.filter((row) => row.name.toLowerCase().includes(q.toLowerCase())).map((row) => ({ id: row.id, type: 'Store', title: row.name, subtitle: 'Your store', href: '/store/stores' })));
      results.push(...orders.map((row) => ({ id: row.id, type: 'Order', title: `Order ${row.id.slice(0, 8)}`, subtitle: `${row.customer?.name || 'Customer'} · ${row.status}`, href: '/store/orders' })));
    } else if (roles.has(Role.RIDER)) {
      const profile = await prisma.riderProfile.findUnique({ where: { userId: actor.id }, select: { id: true } });
      const orders = profile ? await prisma.order.findMany({ where: { riderId: profile.id, id: contains }, select: { id: true, status: true }, take: 15 }) : [];
      results.push(...orders.map((row) => ({ id: row.id, type: 'Delivery', title: `Delivery ${row.id.slice(0, 8)}`, subtitle: row.status, href: '/rider/delivery' })));
    }
    return { query: q, results: results.slice(0, 24) };
  }
}
