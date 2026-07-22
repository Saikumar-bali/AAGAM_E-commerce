'use strict';

const { PrismaClient, Prisma } = require('@prisma/client');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const path = require('path');

require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();
const STORE_A_NAME = 'AAGAM Live QA Store A';
const STORE_B_NAME = 'AAGAM Live QA Store B';
const TEST_PRODUCT_NAME = 'Manual Test Biscuits';
const ISOLATED_A = { latitude: -89, longitude: 0 };
const ISOLATED_B = { latitude: -89, longitude: 1 };

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

async function ensureStore(tx, name, ownerId, coordinates) {
  const existing = await tx.store.findFirst({ where: { name, deletedAt: null } });
  const data = {
    ownerId,
    address: `${name} · isolated live QA only`,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    isActive: false,
    deletedAt: null,
  };
  if (existing) return tx.store.update({ where: { id: existing.id }, data });
  return tx.store.create({ data: { name, ...data } });
}

function snapshotProduct(product) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    pricePaise: product.pricePaise,
    mrpPaise: product.mrpPaise,
    image: product.image,
    images: product.images,
    details: product.details,
    isActive: product.isActive,
    sortOrder: product.sortOrder,
    deletedAt: product.deletedAt ? product.deletedAt.toISOString() : null,
    categoryId: product.categoryId,
  };
}

async function ensureTestProduct(tx) {
  const existing = await tx.product.findFirst({
    where: { name: TEST_PRODUCT_NAME, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!existing) {
    throw new Error(`${TEST_PRODUCT_NAME} must already exist from Admin scenario A1 before W1-W7 runs.`);
  }
  const original = snapshotProduct(existing);
  const product = await tx.product.update({
    where: { id: existing.id },
    data: {
      price: 90,
      pricePaise: 9000,
      mrpPaise: 10000,
      isActive: true,
      deletedAt: null,
    },
  });
  return { product, original };
}

async function cleanup(input) {
  const snapshot = input.productSnapshot;
  if (!snapshot?.id) throw new Error('Cleanup requires the original product snapshot.');

  return prisma.$transaction(async (tx) => {
    const stores = await tx.store.findMany({
      where: { name: { in: [STORE_A_NAME, STORE_B_NAME] }, deletedAt: null },
      select: { id: true },
    });
    const storeIds = stores.map((store) => store.id);
    if (storeIds.length) {
      await tx.inventoryLedger.deleteMany({ where: { storeId: { in: storeIds } } });
      await tx.inventory.deleteMany({ where: { storeId: { in: storeIds } } });
      await tx.store.updateMany({
        where: { id: { in: storeIds } },
        data: { isActive: false },
      });
    }

    await tx.product.update({
      where: { id: snapshot.id },
      data: {
        name: snapshot.name,
        description: snapshot.description ?? null,
        price: snapshot.price,
        pricePaise: snapshot.pricePaise,
        mrpPaise: snapshot.mrpPaise,
        image: snapshot.image ?? null,
        images: snapshot.images === null || snapshot.images === undefined ? Prisma.DbNull : snapshot.images,
        details: snapshot.details === null || snapshot.details === undefined ? Prisma.DbNull : snapshot.details,
        isActive: snapshot.isActive,
        sortOrder: snapshot.sortOrder,
        deletedAt: snapshot.deletedAt ? new Date(snapshot.deletedAt) : null,
        categoryId: snapshot.categoryId,
      },
    });

    return { mode: 'cleanup', storesDeactivated: storeIds.length, productRestored: snapshot.id };
  });
}

async function enableVisibilityStore() {
  return prisma.$transaction(async (tx) => {
    await tx.store.updateMany({
      where: { name: STORE_B_NAME, deletedAt: null },
      data: { isActive: false, ...ISOLATED_B },
    });
    const storeA = await tx.store.findFirst({ where: { name: STORE_A_NAME, deletedAt: null } });
    if (!storeA) throw new Error('QA Store A is missing.');
    const activated = await tx.store.update({
      where: { id: storeA.id },
      data: { isActive: true, ...ISOLATED_A },
    });
    return { mode: 'visibility-on', storeId: activated.id, isolatedCoordinates: ISOLATED_A };
  });
}

async function provision(input) {
  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('A valid QA email is required.');
  if (password.length < 20) throw new Error('QA password must contain at least 20 characters.');

  return prisma.$transaction(async (tx) => {
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
    const storeA = await ensureStore(tx, STORE_A_NAME, owner.id, ISOLATED_A);
    const storeB = await ensureStore(tx, STORE_B_NAME, owner.id, ISOLATED_B);
    const { product: testProduct, original: productSnapshot } = await ensureTestProduct(tx);

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
      mode: 'provision',
      ownerId: owner.id,
      storeA: { id: storeA.id, name: storeA.name, markerName: markerProducts[0].name, isActive: false },
      storeB: { id: storeB.id, name: storeB.name, markerName: markerProducts[1].name, isActive: false },
      testProduct: { id: testProduct.id, name: testProduct.name },
      productSnapshot,
    };
  });
}

async function main() {
  const input = await readInput();
  let result;
  if (input.mode === 'cleanup') result = await cleanup(input);
  else if (input.mode === 'visibility-on') result = await enableVisibilityStore();
  else result = await provision(input);
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
