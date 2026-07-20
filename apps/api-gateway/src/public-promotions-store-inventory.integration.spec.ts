import fs from 'fs';
import path from 'path';
import { ForbiddenException } from '@nestjs/common';
import {
  prisma,
  PromotionPlacement,
  PromotionStatus,
  PromotionTargetType,
  Role,
} from '@aagam/database';
import { PromotionsService } from './promotions/promotions.service';
import { StoreService } from './stores/store.service';

const proofDir = path.resolve(__dirname, '../../../docs/qa/public-promotions-store-inventory');
const proofPath = path.join(proofDir, 'api-proof.json');
const prefix = `_test_public_promotions_inventory_${Date.now()}`;

const cacheManager = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};

describe('Public promotions and store inventory real database integration', () => {
  it('records placements, inventory state, ledger delta, and cross-owner 403', async () => {
    fs.mkdirSync(proofDir, { recursive: true });
    const storeService = new StoreService(cacheManager as any);
    const promotionsService = new PromotionsService();

    const createdIds: {
      userIds: string[];
      storeId?: string;
      productId?: string;
      categoryId?: string;
      campaignId?: string;
    } = { userIds: [] };

    try {
      const [admin, owner, otherOwner] = await Promise.all([
        prisma.user.create({ data: { email: `${prefix}_admin@test.local`, name: 'QA Admin', role: Role.ADMIN } }),
        prisma.user.create({ data: { email: `${prefix}_owner@test.local`, name: 'QA Owner', role: Role.STORE_OWNER } }),
        prisma.user.create({ data: { email: `${prefix}_other@test.local`, name: 'QA Other Owner', role: Role.STORE_OWNER } }),
      ]);
      createdIds.userIds.push(admin.id, owner.id, otherOwner.id);

      const category = await prisma.category.create({ data: { name: `${prefix}_category` } });
      createdIds.categoryId = category.id;
      const product = await prisma.product.create({
        data: {
          name: `${prefix}_product`,
          price: 100,
          pricePaise: 10000,
          mrpPaise: 10000,
          categoryId: category.id,
          isActive: true,
        },
      });
      createdIds.productId = product.id;
      const store = await prisma.store.create({
        data: {
          name: `${prefix}_store`,
          address: 'QA integration address',
          latitude: 17.385,
          longitude: 78.4867,
          ownerId: owner.id,
          isActive: true,
        },
      });
      createdIds.storeId = store.id;

      const campaign = await promotionsService.createCampaign(admin.id, {
        internalName: `${prefix}_campaign`,
        title: 'QA public placement proof',
        subtitle: 'Sanitized real-database promotion proof.',
        status: PromotionStatus.ACTIVE,
        targetType: PromotionTargetType.DEALS,
        placements: [
          PromotionPlacement.LOGIN_SIDEBAR,
          PromotionPlacement.LANDING_HERO,
          PromotionPlacement.LANDING_BANNER,
        ],
      });
      createdIds.campaignId = campaign.id;
      const activeCampaigns = await promotionsService.activeCampaigns(undefined);

      await prisma.inventory.create({
        data: {
          storeId: store.id,
          productId: product.id,
          quantity: 5,
          isListed: true,
          autoHideWhenOutOfStock: true,
          sellingPricePaise: null,
        },
      });
      const inventoryBefore = await prisma.inventory.findUniqueOrThrow({
        where: { storeId_productId: { storeId: store.id, productId: product.id } },
      });

      const patchResult = await storeService.updateInventory(
        store.id,
        product.id,
        17,
        { id: owner.id, role: Role.STORE_OWNER },
        { isListed: false, autoHideWhenOutOfStock: false, sellingPrice: 88.5 },
      );
      const inventoryAfter = await prisma.inventory.findUniqueOrThrow({
        where: { storeId_productId: { storeId: store.id, productId: product.id } },
      });
      const ledger = await prisma.inventoryLedger.findFirstOrThrow({
        where: { storeId: store.id, productId: product.id, reason: 'MANUAL_ADJUSTMENT' },
        orderBy: { createdAt: 'desc' },
      });

      let crossOwnerStatus = 0;
      let crossOwnerMessage = '';
      try {
        await storeService.updateInventory(
          store.id,
          product.id,
          99,
          { id: otherOwner.id, role: Role.STORE_OWNER },
        );
      } catch (error) {
        if (error instanceof ForbiddenException) {
          crossOwnerStatus = error.getStatus();
          crossOwnerMessage = error.message;
        } else {
          throw error;
        }
      }

      expect(patchResult.id).toBe(inventoryAfter.id);
      expect(inventoryAfter).toMatchObject({
        quantity: 17,
        isListed: false,
        autoHideWhenOutOfStock: false,
        sellingPricePaise: 8850,
      });
      expect(ledger).toMatchObject({
        previousQuantity: 5,
        newQuantity: 17,
        quantityDelta: 12,
        actorUserId: owner.id,
      });
      expect(crossOwnerStatus).toBe(403);
      expect(await prisma.inventory.findUniqueOrThrow({
        where: { storeId_productId: { storeId: store.id, productId: product.id } },
      })).toMatchObject({ quantity: 17 });

      const campaignPlacementProof = Object.fromEntries(
        [
          PromotionPlacement.LOGIN_SIDEBAR,
          PromotionPlacement.LANDING_HERO,
          PromotionPlacement.LANDING_BANNER,
        ].map((placement) => [
          placement,
          activeCampaigns.placements[placement]
            .filter((item: any) => item.id === campaign.id)
            .map((item: any) => ({ id: item.id, title: item.title, targetUrl: item.targetUrl })),
        ]),
      );

      fs.writeFileSync(proofPath, JSON.stringify({
        generatedAt: new Date().toISOString(),
        campaignPlacements: campaignPlacementProof,
        inventoryBeforeUpdate: {
          id: inventoryBefore.id,
          productId: inventoryBefore.productId,
          storeId: inventoryBefore.storeId,
          quantity: inventoryBefore.quantity,
          isListed: inventoryBefore.isListed,
          autoHideWhenOutOfStock: inventoryBefore.autoHideWhenOutOfStock,
          sellingPricePaise: inventoryBefore.sellingPricePaise,
        },
        inventoryAfterUpdate: {
          id: inventoryAfter.id,
          productId: inventoryAfter.productId,
          storeId: inventoryAfter.storeId,
          quantity: inventoryAfter.quantity,
          isListed: inventoryAfter.isListed,
          autoHideWhenOutOfStock: inventoryAfter.autoHideWhenOutOfStock,
          sellingPricePaise: inventoryAfter.sellingPricePaise,
        },
        inventoryLedgerEntry: {
          id: ledger.id,
          reason: ledger.reason,
          previousQuantity: ledger.previousQuantity,
          newQuantity: ledger.newQuantity,
          quantityDelta: ledger.quantityDelta,
          actorUserId: ledger.actorUserId,
        },
        crossOwner403: {
          status: crossOwnerStatus,
          message: crossOwnerMessage,
        },
      }, null, 2), 'utf8');
    } finally {
      if (createdIds.campaignId) {
        await prisma.promotionPlacementAssignment.deleteMany({ where: { campaignId: createdIds.campaignId } });
        await prisma.promotionCampaign.deleteMany({ where: { id: createdIds.campaignId } });
      }
      if (createdIds.storeId || createdIds.productId) {
        await prisma.inventoryLedger.deleteMany({
          where: {
            ...(createdIds.storeId ? { storeId: createdIds.storeId } : {}),
            ...(createdIds.productId ? { productId: createdIds.productId } : {}),
          },
        });
        await prisma.inventory.deleteMany({
          where: {
            ...(createdIds.storeId ? { storeId: createdIds.storeId } : {}),
            ...(createdIds.productId ? { productId: createdIds.productId } : {}),
          },
        });
      }
      if (createdIds.storeId) await prisma.store.deleteMany({ where: { id: createdIds.storeId } });
      if (createdIds.productId) await prisma.product.deleteMany({ where: { id: createdIds.productId } });
      if (createdIds.categoryId) await prisma.category.deleteMany({ where: { id: createdIds.categoryId } });
      if (createdIds.userIds.length) await prisma.user.deleteMany({ where: { id: { in: createdIds.userIds } } });
    }
  });
});
