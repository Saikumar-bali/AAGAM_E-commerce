const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const fixture = {
  owner: {
    id: 'maestro-store-owner',
    email: process.env.MAESTRO_STORE_EMAIL || 'maestro.store@aagam.test',
    phone: '+919900000101',
    password: process.env.MAESTRO_STORE_PASSWORD || 'Maestro@2026!',
    name: 'Maestro Store Owner',
  },
  emptyOwner: {
    id: 'maestro-empty-store-owner',
    email: process.env.MAESTRO_EMPTY_STORE_EMAIL || 'maestro.empty@aagam.test',
    phone: '+919900000102',
    password: process.env.MAESTRO_STORE_PASSWORD || 'Maestro@2026!',
    name: 'Maestro Empty Store Owner',
  },
  category: { id: 'maestro-qa-category', name: 'Maestro QA' },
  stores: {
    alpha: {
      id: 'maestro-store-alpha',
      name: 'Maestro Store Alpha',
      address: '101 Release Lane, Hyderabad, Telangana 500001',
      latitude: 17.385,
      longitude: 78.4867,
    },
    beta: {
      id: 'maestro-store-beta',
      name: 'Maestro Store Beta',
      address: '202 Emulator Road, Hyderabad, Telangana 500002',
      latitude: 17.4065,
      longitude: 78.4772,
    },
  },
  products: {
    candidate: {
      id: 'maestro-product-biscuits',
      name: 'Maestro Test Biscuits',
      description: 'Catalogue-only product used by release APK inventory automation.',
      price: 90,
      pricePaise: 9000,
      mrpPaise: 10000,
    },
    alphaExisting: {
      id: 'maestro-alpha-existing',
      name: 'Maestro Existing Milk',
      description: 'Known Alpha inventory used to prove store separation.',
      price: 45,
      pricePaise: 4500,
      mrpPaise: 5000,
    },
    betaExisting: {
      id: 'maestro-beta-existing',
      name: 'Maestro Beta Bread',
      description: 'Known Beta inventory used to prove store switching.',
      price: 35,
      pricePaise: 3500,
      mrpPaise: 4000,
    },
  },
  expected: {
    openingQuantity: 12,
    finalQuantity: 7,
    openingSellingPricePaise: 9000,
    finalSellingPricePaise: 8500,
  },
};

async function upsertUser(input) {
  const password = await bcrypt.hash(input.password, 10);
  return prisma.user.upsert({
    where: { email: input.email },
    update: {
      name: input.name,
      phone: input.phone,
      role: 'STORE_OWNER',
      password,
      emailVerified: true,
    },
    create: {
      id: input.id,
      email: input.email,
      name: input.name,
      phone: input.phone,
      role: 'STORE_OWNER',
      password,
      emailVerified: true,
    },
  });
}

async function upsertProduct(input, categoryId) {
  return prisma.product.upsert({
    where: { id: input.id },
    update: {
      name: input.name,
      description: input.description,
      price: input.price,
      pricePaise: input.pricePaise,
      mrpPaise: input.mrpPaise,
      categoryId,
      isActive: true,
      deletedAt: null,
      sortOrder: 900,
    },
    create: {
      ...input,
      categoryId,
      isActive: true,
      sortOrder: 900,
    },
  });
}

async function main() {
  const owner = await upsertUser(fixture.owner);
  const emptyOwner = await upsertUser(fixture.emptyOwner);

  // A rerun must restore the empty-owner scenario even if someone accidentally
  // attached a test store to this dedicated account in a previous CI attempt.
  await prisma.store.deleteMany({ where: { ownerId: emptyOwner.id } });

  const category = await prisma.category.upsert({
    where: { name: fixture.category.name },
    update: { sortOrder: 900 },
    create: fixture.category,
  });

  const alpha = await prisma.store.upsert({
    where: { id: fixture.stores.alpha.id },
    update: {
      ...fixture.stores.alpha,
      ownerId: owner.id,
      isActive: true,
      deletedAt: null,
    },
    create: { ...fixture.stores.alpha, ownerId: owner.id },
  });
  const beta = await prisma.store.upsert({
    where: { id: fixture.stores.beta.id },
    update: {
      ...fixture.stores.beta,
      ownerId: owner.id,
      isActive: true,
      deletedAt: null,
    },
    create: { ...fixture.stores.beta, ownerId: owner.id },
  });

  const candidate = await upsertProduct(fixture.products.candidate, category.id);
  const alphaExisting = await upsertProduct(fixture.products.alphaExisting, category.id);
  const betaExisting = await upsertProduct(fixture.products.betaExisting, category.id);

  await prisma.inventoryLedger.deleteMany({
    where: {
      productId: candidate.id,
      storeId: { in: [alpha.id, beta.id] },
    },
  });
  await prisma.inventory.deleteMany({
    where: {
      productId: candidate.id,
      storeId: { in: [alpha.id, beta.id] },
    },
  });

  await prisma.inventory.upsert({
    where: { storeId_productId: { storeId: alpha.id, productId: alphaExisting.id } },
    update: {
      quantity: 8,
      sellingPricePaise: 4300,
      isListed: true,
      autoHideWhenOutOfStock: true,
    },
    create: {
      storeId: alpha.id,
      productId: alphaExisting.id,
      quantity: 8,
      sellingPricePaise: 4300,
      isListed: true,
      autoHideWhenOutOfStock: true,
    },
  });
  await prisma.inventory.upsert({
    where: { storeId_productId: { storeId: beta.id, productId: betaExisting.id } },
    update: {
      quantity: 15,
      sellingPricePaise: 3300,
      isListed: true,
      autoHideWhenOutOfStock: true,
    },
    create: {
      storeId: beta.id,
      productId: betaExisting.id,
      quantity: 15,
      sellingPricePaise: 3300,
      isListed: true,
      autoHideWhenOutOfStock: true,
    },
  });

  const ownerStores = await prisma.store.findMany({
    where: { ownerId: owner.id, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  const emptyOwnerStoreCount = await prisma.store.count({
    where: { ownerId: emptyOwner.id, deletedAt: null },
  });

  if (ownerStores.length !== 2) {
    throw new Error(`Expected the Maestro owner to have exactly two stores, found ${ownerStores.length}`);
  }
  if (emptyOwnerStoreCount !== 0) {
    throw new Error(`Expected the empty Maestro owner to have zero stores, found ${emptyOwnerStoreCount}`);
  }

  const output = {
    ...fixture,
    owner: { ...fixture.owner, password: '[CI-only password omitted]' },
    emptyOwner: { ...fixture.emptyOwner, password: '[CI-only password omitted]' },
    created: {
      ownerId: owner.id,
      emptyOwnerId: emptyOwner.id,
      categoryId: category.id,
      ownerStores,
      emptyOwnerStoreCount,
    },
  };

  const outputDir = path.resolve(process.cwd(), 'artifacts/maestro');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'fixture.json'), `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output.created, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
