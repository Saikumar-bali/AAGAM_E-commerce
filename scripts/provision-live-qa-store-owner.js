'use strict';

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const path = require('path');

require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();
const STORE_A_NAME = 'AAGAM Live QA Store A';
const STORE_B_NAME = 'AAGAM Live QA Store B';
const TEST_PRODUCT_NAME = 'Manual Test Biscuits';

async function readInput() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  if (!raw.trim()) throw new Error('QA bootstrap input is required on stdin.');
  return JSON.parse(raw);
}

async function grantStoreOwnerRole(tx, userId) {
  await tx.$executeRawUnsafe(
    `INSERT INTO "UserRoleMembership" (
       "id", "userId", "role", "status", "source", "grantedByUserId", "grantedAt", "revokedAt"
     ) VALUES ($1,$2,'STORE_OWNER'::"Role",'ACTIVE','LIVE_QA_BOOTSTRAP',NULL,CURRENT_TIMESTAMP,NULL)
     ON CONFLICT ("userId", "role") DO UPDATE SET
       "status" = 'ACTIVE', "source" = EXCLUDED."source",
       "grantedAt" = CURRENT_TIMESTAMP, "revokedAt" = NULL`,
    crypto.randomUUID(),
    userId,
  );
}

async function ensureStore(tx, name, ownerId, latitude, longitude) {
  const existing = await tx.store.findFirst({ where: { name, deletedAt: null } });
  if (existing) {
    return tx.store.update({
      where: { id: existing.id },
      data: {
        ownerId,
        address: `${name}, Hyderabad QA`,
        latitude,
        longitude,
        isActive: true,
        deletedAt: null,
      },
    });
  }
  return tx.store.create({
    data: {
      name,
      address: `${name}, Hyderabad QA`,
      latitude,
      longitude,
      ownerId,
      isActive: true,
    },
  });
}

async function ensureTestProduct(tx) {
  const existing = await tx.product.findFirst({
    where: { name: TEST_PRODUCT_NAME, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) {
    return tx.product.update({
      where: { id: existing.id },
      data: {
        price: 90,
        pricePaise: 9000,
        mrpPaise: 10000,
        isActive: true,
        deletedAt: null,
      },
    });
  }
  let category = await tx.category.findFirst({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  if (!category) category = await tx.category.create({ data: { name: 'QA Catalogue', sortOrder: 9999 } });
  return tx.product.create({
    data: {
      name: TEST_PRODUCT_NAME,
      description: 'Dedicated live browser QA product',
      price: 90,
      pricePaise: 9000,
      mrpPaise: 10000,
      categoryId: category.id,
      isActive: true,
      sortOrder: 9999,
    },
  });
}

async function main() {
  const input = await readInput();
  if (input.mode === 'cleanup') {
    const result = await prisma.store.updateMany({
      where: { name: { in: [STORE_A_NAME, STORE_B_NAME] }, deletedAt: null },
      data: { isActive: false },
    });
    process.stdout.write(JSON.stringify({ mode: 'cleanup', storesDeactivated: result.count }));
    return;
  }

  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('A valid QA email is required.');
  if (password.length < 20) throw new Error('QA password must contain at least 20 characters.');

  const result = await prisma.$transaction(async (tx) => {
    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await tx.user.findUnique({ where: { email } });
    const owner = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: {
            name: 'AAGAM Live QA Store Owner',
            password: passwordHash,
            role: 'STORE_OWNER',
            emailVerified: true,
          },
        })
      : await tx.user.create({
          data: {
            email,
            name: 'AAGAM Live QA Store Owner',
            password: passwordHash,
            role: 'STORE_OWNER',
            emailVerified: true,
          },
        });

    await grantStoreOwnerRole(tx, owner.id);
    const storeA = await ensureStore(tx, STORE_A_NAME, owner.id, 17.4401, 78.3489);
    const storeB = await ensureStore(tx, STORE_B_NAME, owner.id, 17.4411, 78.3499);
    const testProduct = await ensureTestProduct(tx);

    await tx.inventoryLedger.deleteMany({
      where: { storeId: { in: [storeA.id, storeB.id] }, productId: testProduct.id },
    });
    await tx.inventory.deleteMany({
      where: { storeId: { in: [storeA.id, storeB.id] }, productId: testProduct.id },
    });

    const markerProducts = await tx.product.findMany({
      where: { id: { not: testProduct.id }, isActive: true, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
      take: 2,
    });
    if (markerProducts.length < 2) throw new Error('At least two active catalogue products are required for W7 race markers.');

    await tx.inventory.upsert({
      where: { storeId_productId: { storeId: storeA.id, productId: markerProducts[0].id } },
      create: {
        storeId: storeA.id,
        productId: markerProducts[0].id,
        quantity: 11,
        isListed: false,
        autoHideWhenOutOfStock: true,
      },
      update: { quantity: 11, isListed: false, autoHideWhenOutOfStock: true },
    });
    await tx.inventory.upsert({
      where: { storeId_productId: { storeId: storeB.id, productId: markerProducts[1].id } },
      create: {
        storeId: storeB.id,
        productId: markerProducts[1].id,
        quantity: 22,
        isListed: false,
        autoHideWhenOutOfStock: true,
      },
      update: { quantity: 22, isListed: false, autoHideWhenOutOfStock: true },
    });

    return {
      ownerId: owner.id,
      storeA: { id: storeA.id, name: storeA.name, markerName: markerProducts[0].name },
      storeB: { id: storeB.id, name: storeB.name, markerName: markerProducts[1].name },
      testProduct: { id: testProduct.id, name: testProduct.name },
    };
  });

  process.stdout.write(JSON.stringify(result));
}

main()
  .catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
