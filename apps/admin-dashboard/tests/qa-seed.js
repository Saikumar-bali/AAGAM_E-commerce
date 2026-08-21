const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
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

  // Ensure a DEFAULT delivery fee rule exists so checkout is serviceable
  await prisma.deliveryFeeRule.upsert({
    where: { id: '__qa_default_delivery_rule__' },
    update: {},
    create: {
      id: '__qa_default_delivery_rule__',
      name: 'QA Default',
      matchType: 'DEFAULT',
      ratePaisePerKm: 200,
      freeDeliveryMinimumPaise: 9900,
      priority: 100,
      isActive: true,
    },
  });
  console.log('  QA default delivery fee rule ready');

  const qaCustomer = await prisma.user.upsert({
    where: { email: 'qa-rider-pick-customer@aagam.com' },
    update: { role: 'CUSTOMER', name: 'QA Rider Pick Customer' },
    create: { email: 'qa-rider-pick-customer@aagam.com', role: 'CUSTOMER', name: 'QA Rider Pick Customer' },
  });
  console.log('  QA customer ready:', qaCustomer.id);

  const qaStorePass = process.env.STORE_OWNER_QA_PASSWORD || 'store@2026!';
  const qaStoreHashedPass = await bcrypt.hash(qaStorePass, 10);
  const qaStoreOwner = await prisma.user.upsert({
    where: { email: 'qa-rider-pick-store@aagam.com' },
    update: { role: 'STORE_OWNER', name: 'QA Rider Pick Store Owner', password: qaStoreHashedPass },
    create: { email: 'qa-rider-pick-store@aagam.com', role: 'STORE_OWNER', name: 'QA Rider Pick Store Owner', password: qaStoreHashedPass },
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

  // Seed customer address for serviceability tests
  const qaAddress = await prisma.customerAddress.upsert({
    where: { id: 'qa-addr-ahmedabad' },
    update: { userId: qaCustomer.id, line1: 'SG Highway', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015', isDefault: true },
    create: { id: 'qa-addr-ahmedabad', userId: qaCustomer.id, recipientName: 'QA Customer', phoneE164: '+919999999999', line1: 'SG Highway', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015', country: 'IN', latitude: 23.0225, longitude: 72.5714, isDefault: true },
  });
  console.log('  QA customer address ready:', qaAddress.id);

  // Also create an address for the main customer@aagam.com user for Phase 6 tests
  const mainCustomer = await prisma.user.findUnique({ where: { email: 'customer@aagam.com' } });
  if (mainCustomer) {
    const existingAddr = await prisma.customerAddress.findFirst({ where: { userId: mainCustomer.id, city: 'Ahmedabad' } });
    if (!existingAddr) {
      await prisma.customerAddress.create({
        data: { userId: mainCustomer.id, recipientName: 'Test Customer', phoneE164: '+919999999998', line1: 'SG Highway', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015', country: 'IN', latitude: 23.0225, longitude: 72.5714, isDefault: true },
      });
      console.log('  Created Ahmedabad address for customer@aagam.com');
    } else {
      console.log('  customer@aagam.com already has Ahmedabad address');
    }
  }

  // Phase 8b: seed qa-p8b products, categories, order
  const p8bCategory = await prisma.category.upsert({
    where: { id: 'qa-cat-p8b' },
    update: { name: 'QA P8B Grocery' },
    create: { id: 'qa-cat-p8b', name: 'QA P8B Grocery' },
  });
  console.log('  P8B category ready:', p8bCategory.id);

  const p8bRice = await prisma.product.upsert({
    where: { id: 'qa-p8b-rice' },
    update: { name: 'P8B Basmati Rice (1kg)', price: 120, pricePaise: 12000, categoryId: p8bCategory.id },
    create: { id: 'qa-p8b-rice', name: 'P8B Basmati Rice (1kg)', price: 120, pricePaise: 12000, categoryId: p8bCategory.id },
  });
  console.log('  P8B rice ready:', p8bRice.id);

  const p8bAtta = await prisma.product.upsert({
    where: { id: 'qa-p8b-atta' },
    update: { name: 'P8B Whole Wheat Atta (1kg)', price: 90, pricePaise: 9000, categoryId: p8bCategory.id },
    create: { id: 'qa-p8b-atta', name: 'P8B Whole Wheat Atta (1kg)', price: 90, pricePaise: 9000, categoryId: p8bCategory.id },
  });
  console.log('  P8B atta ready:', p8bAtta.id);

  await prisma.inventory.upsert({
    where: { storeId_productId: { storeId: qaStore.id, productId: p8bRice.id } },
    update: { quantity: 30 },
    create: { storeId: qaStore.id, productId: p8bRice.id, quantity: 30 },
  });
  await prisma.inventory.upsert({
    where: { storeId_productId: { storeId: qaStore.id, productId: p8bAtta.id } },
    update: { quantity: 30 },
    create: { storeId: qaStore.id, productId: p8bAtta.id, quantity: 30 },
  });
  console.log('  P8B inventory ready');

  // Create qa-p8b-order-picking as PICKING order with 2 items
  await prisma.orderItem.deleteMany({ where: { orderId: 'qa-p8b-order-picking' } });
  await prisma.order.deleteMany({ where: { id: 'qa-p8b-order-picking' } });
  await prisma.order.create({
    data: {
      id: 'qa-p8b-order-picking',
      customerId: qaCustomer.id,
      storeId: qaStore.id,
      status: 'PICKING',
      totalAmount: 210,
      grandTotal: 210,
      grandTotalPaise: 21000,
      deliveryLat: 23.0225,
      deliveryLng: 72.5714,
      pickingAt: new Date(),
      confirmedAt: new Date(Date.now() - 3600000),
      items: {
        create: [
          { id: 'qa-p8b-item-rice', productId: p8bRice.id, quantity: 1, price: 120 },
          { id: 'qa-p8b-item-atta', productId: p8bAtta.id, quantity: 1, price: 90 },
        ],
      },
    },
  });
  console.log('  qa-p8b-order-picking created as PICKING');

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

  // Subscription delivery-runs QA fixture: a published weekly plan and an owned customer contract.
  const qaSubscriptionProduct = await prisma.product.upsert({
    where: { id: 'qa-subscription-milk-1l' },
    update: { name: 'Buffalo Milk 1 L', price: 70, pricePaise: 7000, categoryId: qaCategory.id },
    create: { id: 'qa-subscription-milk-1l', name: 'Buffalo Milk 1 L', price: 70, pricePaise: 7000, categoryId: qaCategory.id },
  });
  await prisma.inventory.upsert({
    where: { storeId_productId: { storeId: qaStore.id, productId: qaSubscriptionProduct.id } },
    update: { quantity: 50 },
    create: { storeId: qaStore.id, productId: qaSubscriptionProduct.id, quantity: 50 },
  });

  const subscriptionAdmin = await prisma.user.findUnique({ where: { email: 'admin@aagam.com' } });
  const subscriptionCustomer = await prisma.user.findUnique({ where: { email: 'customer@aagam.com' } });
  const subscriptionAddress = subscriptionCustomer
    ? await prisma.customerAddress.findFirst({ where: { userId: subscriptionCustomer.id }, orderBy: { isDefault: 'desc' } })
    : null;
  if (subscriptionAdmin && subscriptionCustomer && subscriptionAddress) {
    const qaPlan = await prisma.subscriptionPlan.upsert({
      where: { code: 'QA-MILK-7' },
      update: {
        name: 'Buffalo Milk 1 L · 7 Days',
        internalName: 'QA Buffalo Milk 7 Day',
        status: 'ACTIVE',
        fundingCycle: 'WEEKLY',
        durationDays: 7,
        totalDeliveries: 7,
        deliveryFrequency: 'DAILY',
        pricePaise: 49000,
        mrpPaise: 52500,
        defaultWindowStartMinute: 360,
        defaultWindowEndMinute: 540,
        proofPolicy: { personal: ['OTP', 'GPS'], trustedDrop: ['GEOFENCE', 'TOKEN', 'PHOTO'] },
        createdById: subscriptionAdmin.id,
        updatedById: subscriptionAdmin.id,
      },
      create: {
        id: 'qa-subscription-plan-milk-7',
        code: 'QA-MILK-7',
        internalName: 'QA Buffalo Milk 7 Day',
        name: 'Buffalo Milk 1 L · 7 Days',
        description: 'Fresh morning milk with weekly cash funding.',
        status: 'ACTIVE',
        fundingCycle: 'WEEKLY',
        durationDays: 7,
        totalDeliveries: 7,
        deliveryFrequency: 'DAILY',
        pricePaise: 49000,
        mrpPaise: 52500,
        defaultWindowStartMinute: 360,
        defaultWindowEndMinute: 540,
        orderGenerationHoursBefore: 18,
        skipCutoffHours: 12,
        allowPause: true,
        allowSkip: true,
        maximumSkips: 2,
        allowTrustedDrop: true,
        allowPersonalHandover: true,
        allowSecurityHandover: true,
        proofPolicy: { personal: ['OTP', 'GPS'], trustedDrop: ['GEOFENCE', 'TOKEN', 'PHOTO'] },
        sortOrder: 1,
        createdById: subscriptionAdmin.id,
        updatedById: subscriptionAdmin.id,
      },
    });
    await prisma.subscriptionPlanItem.deleteMany({ where: { planId: qaPlan.id } });
    await prisma.subscriptionPlanItem.create({
      data: { planId: qaPlan.id, productId: qaSubscriptionProduct.id, quantityPerDelivery: 1 },
    });
    await prisma.subscriptionPlanStore.upsert({
      where: { planId_storeId: { planId: qaPlan.id, storeId: qaStore.id } },
      update: {},
      create: { planId: qaPlan.id, storeId: qaStore.id },
    });
    const itemSnapshot = [{ productId: qaSubscriptionProduct.id, name: qaSubscriptionProduct.name, quantityPerDelivery: 1, unitPricePaise: qaSubscriptionProduct.pricePaise }];
    const qaVersion = await prisma.subscriptionPlanVersion.upsert({
      where: { planId_version: { planId: qaPlan.id, version: 1 } },
      update: {
        pricePaise: 49000,
        mrpPaise: 52500,
        totalDeliveries: 7,
        durationDays: 7,
        fundingCycle: 'WEEKLY',
        deliveryFrequency: 'DAILY',
        itemsSnapshot: itemSnapshot,
        fullSnapshot: { code: qaPlan.code, name: qaPlan.name, items: itemSnapshot, fundingCycle: 'WEEKLY', totalDeliveries: 7, pricePaise: 49000 },
      },
      create: {
        id: 'qa-subscription-plan-version-milk-7-v1',
        planId: qaPlan.id,
        version: 1,
        pricePaise: 49000,
        mrpPaise: 52500,
        totalDeliveries: 7,
        durationDays: 7,
        fundingCycle: 'WEEKLY',
        deliveryFrequency: 'DAILY',
        itemsSnapshot: itemSnapshot,
        deliveryRulesSnapshot: { skipCutoffHours: 12, maximumSkips: 2, skipPolicy: 'EXTEND_PLAN', defaultWindowStartMinute: 360, defaultWindowEndMinute: 540 },
        proofPolicySnapshot: { personal: ['OTP', 'GPS'], trustedDrop: ['GEOFENCE', 'TOKEN', 'PHOTO'] },
        applicabilitySnapshot: { storeIds: [qaStore.id], zoneIds: [] },
        fullSnapshot: { code: qaPlan.code, name: qaPlan.name, items: itemSnapshot, fundingCycle: 'WEEKLY', totalDeliveries: 7, pricePaise: 49000 },
        createdById: subscriptionAdmin.id,
      },
    });
    await prisma.customerSubscription.deleteMany({ where: { id: 'qa-customer-subscription-milk-7' } });
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() + 1);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 6);
    const addressSnapshot = {
      id: subscriptionAddress.id,
      label: subscriptionAddress.label,
      line1: subscriptionAddress.line1,
      city: subscriptionAddress.city,
      state: subscriptionAddress.state,
      pincode: subscriptionAddress.pincode,
      latitude: subscriptionAddress.latitude,
      longitude: subscriptionAddress.longitude,
    };
    await prisma.customerSubscription.create({
      data: {
        id: 'qa-customer-subscription-milk-7',
        customerId: subscriptionCustomer.id,
        planId: qaPlan.id,
        planVersionId: qaVersion.id,
        addressId: subscriptionAddress.id,
        homeStoreId: qaStore.id,
        status: 'PENDING_CASH_COLLECTION',
        startDate,
        endDate,
        nextDeliveryDate: startDate,
        nextCashCollectionDate: startDate,
        deliveryWindowStartMinute: 360,
        deliveryWindowEndMinute: 540,
        deliveryMethod: 'PERSONAL_HANDOVER',
        priceSnapshot: { pricePaise: 49000, mrpPaise: 52500, currency: 'INR' },
        itemsSnapshot: itemSnapshot,
        addressSnapshot,
        policySnapshot: { allowPause: true, allowSkip: true, maximumSkips: 2, skipPolicy: 'EXTEND_PLAN', proofPolicy: { personal: ['OTP', 'GPS'] } },
        amountDuePaise: 49000,
        fundingCycle: 'WEEKLY',
        deliveries: {
          create: Array.from({ length: 7 }, (_, index) => {
            const serviceDate = new Date(startDate);
            serviceDate.setUTCDate(serviceDate.getUTCDate() + index);
            return {
              serviceDate,
              sequenceNumber: index + 1,
              generationKey: `qa-subscription:milk-7:${serviceDate.toISOString().slice(0, 10)}`,
              cashDuePaise: index === 0 ? 49000 : 0,
              proofMode: 'PERSONAL_OTP_GPS',
            };
          }),
        },
      },
    });
    console.log('  Subscription QA weekly plan and customer contract ready');
  } else {
    console.log('  Subscription QA fixture skipped because seeded admin/customer/address is missing');
  }

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
