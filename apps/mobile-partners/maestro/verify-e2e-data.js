const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ids = {
  owner: 'maestro-store-owner',
  emptyOwner: 'maestro-empty-store-owner',
  alpha: 'maestro-store-alpha',
  beta: 'maestro-store-beta',
  candidate: 'maestro-product-biscuits',
  betaExisting: 'maestro-beta-existing',
};

const expected = {
  ownerStoreCount: 2,
  emptyOwnerStoreCount: 0,
  openingQuantity: 12,
  finalQuantity: 7,
  finalSellingPricePaise: 8500,
  isListed: false,
  autoHideWhenOutOfStock: false,
  betaExistingQuantity: 15,
};

function assertCondition(condition, message, failures) {
  if (!condition) failures.push(message);
}

async function main() {
  const [ownerStores, emptyOwnerStores, alphaCandidate, betaCandidate, betaExisting, ledgers] = await Promise.all([
    prisma.store.findMany({
      where: { ownerId: ids.owner, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.store.findMany({
      where: { ownerId: ids.emptyOwner, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.inventory.findUnique({
      where: { storeId_productId: { storeId: ids.alpha, productId: ids.candidate } },
      include: { product: { select: { name: true } } },
    }),
    prisma.inventory.findUnique({
      where: { storeId_productId: { storeId: ids.beta, productId: ids.candidate } },
    }),
    prisma.inventory.findUnique({
      where: { storeId_productId: { storeId: ids.beta, productId: ids.betaExisting } },
      include: { product: { select: { name: true } } },
    }),
    prisma.inventoryLedger.findMany({
      where: { storeId: ids.alpha, productId: ids.candidate },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        reason: true,
        quantityDelta: true,
        previousQuantity: true,
        newQuantity: true,
        actorUserId: true,
        note: true,
        createdAt: true,
      },
    }),
  ]);

  const openingLedgers = ledgers.filter((entry) => entry.reason === 'OPENING_STOCK');
  const finalQuantityAdjustment = ledgers.find((entry) =>
    entry.reason === 'MANUAL_ADJUSTMENT' &&
    entry.previousQuantity === expected.openingQuantity &&
    entry.newQuantity === expected.finalQuantity,
  );

  const failures = [];
  assertCondition(ownerStores.length === expected.ownerStoreCount,
    `Store owner must own exactly ${expected.ownerStoreCount} stores; found ${ownerStores.length}.`, failures);
  assertCondition(emptyOwnerStores.length === expected.emptyOwnerStoreCount,
    `Empty-state owner must own zero stores; found ${emptyOwnerStores.length}.`, failures);
  assertCondition(Boolean(alphaCandidate), 'Candidate product was not added to Maestro Store Alpha.', failures);
  assertCondition(alphaCandidate?.quantity === expected.finalQuantity,
    `Alpha candidate quantity must be ${expected.finalQuantity}; found ${alphaCandidate?.quantity}.`, failures);
  assertCondition(alphaCandidate?.sellingPricePaise === expected.finalSellingPricePaise,
    `Alpha candidate selling price must be ${expected.finalSellingPricePaise} paise; found ${alphaCandidate?.sellingPricePaise}.`, failures);
  assertCondition(alphaCandidate?.isListed === expected.isListed,
    `Alpha candidate isListed must be ${expected.isListed}; found ${alphaCandidate?.isListed}.`, failures);
  assertCondition(alphaCandidate?.autoHideWhenOutOfStock === expected.autoHideWhenOutOfStock,
    `Alpha candidate auto-hide must be ${expected.autoHideWhenOutOfStock}; found ${alphaCandidate?.autoHideWhenOutOfStock}.`, failures);
  assertCondition(betaCandidate === null, 'Candidate product must not be carried by Maestro Store Beta.', failures);
  assertCondition(betaExisting?.quantity === expected.betaExistingQuantity,
    `Beta control inventory must remain ${expected.betaExistingQuantity}; found ${betaExisting?.quantity}.`, failures);
  assertCondition(openingLedgers.length === 1,
    `Exactly one OPENING_STOCK ledger is required; found ${openingLedgers.length}.`, failures);
  assertCondition(openingLedgers[0]?.quantityDelta === expected.openingQuantity,
    `OPENING_STOCK quantityDelta must be ${expected.openingQuantity}; found ${openingLedgers[0]?.quantityDelta}.`, failures);
  assertCondition(openingLedgers[0]?.previousQuantity === 0,
    `OPENING_STOCK previousQuantity must be 0; found ${openingLedgers[0]?.previousQuantity}.`, failures);
  assertCondition(openingLedgers[0]?.newQuantity === expected.openingQuantity,
    `OPENING_STOCK newQuantity must be ${expected.openingQuantity}; found ${openingLedgers[0]?.newQuantity}.`, failures);
  assertCondition(openingLedgers[0]?.actorUserId === ids.owner,
    `OPENING_STOCK actor must be ${ids.owner}; found ${openingLedgers[0]?.actorUserId}.`, failures);
  assertCondition(Boolean(finalQuantityAdjustment),
    `A MANUAL_ADJUSTMENT from ${expected.openingQuantity} to ${expected.finalQuantity} was not recorded.`, failures);

  const result = {
    result: failures.length === 0 ? 'PASSED' : 'FAILED',
    verifiedAt: new Date().toISOString(),
    expected,
    actual: {
      ownerStores,
      emptyOwnerStores,
      alphaCandidate,
      betaCandidate,
      betaExisting,
      ledgers,
    },
    failures,
  };

  const outputDir = path.resolve(process.cwd(), 'artifacts/maestro');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'database-proof.json'), `${JSON.stringify(result, null, 2)}\n`);

  const markdown = [
    '# AAGAM Partners Maestro database proof',
    '',
    `- Result: **${result.result}**`,
    `- Verified: ${result.verifiedAt}`,
    `- Store Owner stores: ${ownerStores.map((store) => store.name).join(', ') || 'none'}`,
    `- Empty-state owner stores: ${emptyOwnerStores.length}`,
    `- Alpha candidate quantity: ${alphaCandidate?.quantity ?? 'missing'}`,
    `- Alpha candidate price: ${alphaCandidate?.sellingPricePaise ?? 'missing'} paise`,
    `- Alpha candidate listing: ${alphaCandidate?.isListed ?? 'missing'}`,
    `- Alpha candidate auto-hide: ${alphaCandidate?.autoHideWhenOutOfStock ?? 'missing'}`,
    `- Beta candidate present: ${Boolean(betaCandidate)}`,
    `- OPENING_STOCK ledger count: ${openingLedgers.length}`,
    `- Final quantity adjustment found: ${Boolean(finalQuantityAdjustment)}`,
    '',
    ...(failures.length ? ['## Failures', '', ...failures.map((failure) => `- ${failure}`), ''] : []),
  ].join('\n');
  fs.writeFileSync(path.join(outputDir, 'database-proof.md'), markdown);

  console.log(markdown);
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
