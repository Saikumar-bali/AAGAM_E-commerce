const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const prisma = new PrismaClient();

/**
 * Safety gate. The QA seed performs destructive writes (upserts, updates,
 * deletions) to set up deterministic Playwright state. It must NEVER run
 * against a production or staging database.
 */
function assertSafeQaSeedTarget() {
  const qaSeedFlag = process.env.PLAYWRIGHT_QA_SEED;
  const nodeEnv = process.env.NODE_ENV;
  const dbUrl = process.env.DATABASE_URL || '';

  if (qaSeedFlag !== 'true') {
    throw new Error(
      'QA seed safety check FAILED: PLAYWRIGHT_QA_SEED is not set to "true". ' +
        'Refusing to run destructive seed. Set PLAYWRIGHT_QA_SEED=true to allow local/test seeding only.',
    );
  }

  if (nodeEnv === 'production') {
    throw new Error(
      'QA seed safety check FAILED: NODE_ENV is "production". ' +
        'QA seed must never run in production.',
    );
  }

  const forbiddenHosts = ['railway', 'supabase', 'neon', 'render', 'production'];
  const lowerUrl = dbUrl.toLowerCase();
  const matched = forbiddenHosts.find((host) => lowerUrl.includes(host));
  if (matched) {
    throw new Error(
      `QA seed safety check FAILED: DATABASE_URL appears to target a production/cloud DB ` +
        `(matched "${matched}" in connection string). QA seed is local/test only.`,
    );
  }

  console.log('QA seed safety check passed: local/test DB only');
}

async function main() {
  assertSafeQaSeedTarget();
  console.log('QA Seed: Ensuring test orders are in correct state...');

  const qaCustomer = await prisma.user.upsert({
    where: { email: 'qa-rider-pick-customer@aagam.com' },
    update: { role: 'CUSTOMER', name: 'QA Rider Pick Customer' },
    create: { email: 'qa-rider-pick-customer@aagam.com', role: 'CUSTOMER', name: 'QA Rider Pick Customer' },
  });
  console.log('  QA customer ready:', qaCustomer.id);

  const qaStoreOwner = await prisma.user.upsert({
    where: { email: 'qa-rider-pick-store@aagam.com' },
    update: { role: 'STORE_OWNER', name: 'QA Rider Pick Store Owner' },
    create: { email: 'qa-rider-pick-store@aagam.com', role: 'STORE_OWNER', name: 'QA Rider Pick Store Owner' },
  });
  console.log('  QA store owner ready:', qaStoreOwner.id);

  const qaStore = await prisma.store.upsert({
    where: { id: 'qa-store-rider-pick' },
    update: { name: 'QA Rider Pick Store', ownerId: qaStoreOwner.id },
    create: {
      id: 'qa-store-rider-pick',
      name: 'QA Rider Pick Store',
      address: 'QA Address',
      latitude: 23.0225,
      longitude: 72.5714,
      ownerId: qaStoreOwner.id,
    },
  });
  console.log('  QA store ready:', qaStore.id);

  const qaCategory = await prisma.category.upsert({
    where: { id: 'qa-cat-rider-pick' },
    update: { name: 'QA Rider Pick Cat' },
    create: { id: 'qa-cat-rider-pick', name: 'QA Rider Pick Cat' },
  });
  console.log('  QA category ready:', qaCategory.id);

  const qaProduct = await prisma.product.upsert({
    where: { id: 'qa-prod-rice' },
    update: { name: 'QA Rice (1kg)', price: 120, pricePaise: 12000, categoryId: qaCategory.id },
    create: { id: 'qa-prod-rice', name: 'QA Rice (1kg)', price: 120, pricePaise: 12000, categoryId: qaCategory.id },
  });
  console.log('  QA product ready:', qaProduct.id);

  await prisma.inventory.upsert({
    where: { storeId_productId: { storeId: qaStore.id, productId: qaProduct.id } },
    update: { quantity: 50 },
    create: { storeId: qaStore.id, productId: qaProduct.id, quantity: 50 },
  });
  console.log('  QA inventory ready');

  const order1 = await prisma.order.findUnique({ where: { id: 'qa-order-1' } });
  if (order1 && order1.status !== 'PICKING') {
    await prisma.order.update({
      where: { id: 'qa-order-1' },
      data: {
        status: 'PICKING',
        pickingAt: new Date(),
        riderId: null,
        riderAssignedAt: null,
        outForDeliveryAt: null,
        deliveredAt: null,
        cancelledAt: null,
      },
    });
    console.log('  Reset qa-order-1 to PICKING');
  } else {
    console.log('  qa-order-1 already PICKING');
  }

  if (order1 && order1.riderId) {
    await prisma.order.update({ where: { id: 'qa-order-1' }, data: { riderId: null } });
    console.log('  Cleared rider from qa-order-1');
  }

  await prisma.orderItem.deleteMany({ where: { orderId: 'qa-order-rider-pick' } });
  await prisma.order.deleteMany({ where: { id: 'qa-order-rider-pick' } });
  await prisma.order.create({
    data: {
      id: 'qa-order-rider-pick',
      customerId: qaCustomer.id,
      storeId: qaStore.id,
      status: 'CONFIRMED',
      totalAmount: 120,
      grandTotal: 120,
      grandTotalPaise: 12000,
      deliveryLat: 23.0225,
      deliveryLng: 72.5714,
      confirmedAt: new Date(),
      items: {
        create: [{ id: 'qa-rider-item-1', productId: qaProduct.id, quantity: 1, price: 120 }],
      },
    },
  });
  console.log('  Created qa-order-rider-pick using current upserted foreign keys');

  const resetPackedOrder = async (id) => {
    const order = await prisma.order.findUnique({ where: { id } });
    if (order && order.status !== 'PACKED') {
      await prisma.order.update({
        where: { id },
        data: {
          status: 'PACKED',
          packedAt: new Date(),
          riderId: null,
          riderAssignedAt: null,
          outForDeliveryAt: null,
          deliveredAt: null,
          cancelledAt: null,
        },
      });
      console.log(`  Reset ${id} to PACKED`);
    } else {
      console.log(`  ${id} already PACKED`);
    }
  };

  await resetPackedOrder('qa-order-4');
  await resetPackedOrder('qa-order-6');

  const riderUser = await prisma.user.upsert({
    where: { email: 'rider@aagam.com' },
    update: { role: 'RIDER', name: 'QA Rider' },
    create: { email: 'rider@aagam.com', role: 'RIDER', name: 'QA Rider' },
  });
  const riderProfile = await prisma.riderProfile.upsert({
    where: { userId: riderUser.id },
    update: { status: 'ONLINE', latitude: 23.0225, longitude: 72.5714 },
    create: { userId: riderUser.id, status: 'ONLINE', latitude: 23.0225, longitude: 72.5714 },
  });
  console.log('  rider@aagam.com profile ONLINE:', riderProfile.id);

  await prisma.order.updateMany({
    where: {
      id: { in: ['qa-order-2', 'qa-order-3'] },
      status: { in: ['RIDER_ASSIGNED', 'OUT_FOR_DELIVERY'] },
    },
    data: { status: 'DELIVERED', deliveredAt: new Date(), riderId: null },
  });
  console.log('  Cleared active rider orders');
  console.log('QA Seed complete.');
}

main()
  .catch((error) => {
    console.error('QA Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
