/**
 * Cart pricing and coupon application.
 *
 * Split out of the former checkout.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryFeeRule, prisma } from '@aagam/database';
import { CheckoutQuoteDto } from './dto/checkout.dto';
import { calculateDeliveryPricing } from './delivery-pricing';
import { DeliveryFeeRulesService } from '../stores/delivery-fee-rules.service';
import { PromotionsService } from '../promotions/promotions.service';
import { CheckoutServiceBase } from './checkout.service.base';
import { computeEtaMinutes, normalizeItems } from './checkout.shared';

@Injectable()
export class CheckoutQuoteService extends CheckoutServiceBase {
  constructor(private readonly deliveryFeeRules: DeliveryFeeRulesService, private readonly promotionsService: PromotionsService | undefined) {
    super();
  }

  async quote(userId: string, dto: CheckoutQuoteDto) {
    if (!dto.items?.length) throw new BadRequestException('No items');
    const normalizedItems = normalizeItems(dto.items);
    const priorOrder = await prisma.order.findFirst({
      where: {
        customerId: userId,
        status: { notIn: ['CANCELLED', 'PAYMENT_FAILED'] as any },
      },
      select: { id: true },
    });
    const firstOrderEligible = !priorOrder;

    const address = dto.addressId
      ? await prisma.customerAddress.findFirst({ where: { id: dto.addressId, userId } })
      : null;
    if (dto.addressId && !address) {
      throw new NotFoundException('Address not found');
    }

    const productIds = normalizedItems.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null, isActive: true },
      select: { id: true, name: true, price: true, pricePaise: true, image: true, categoryId: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const missing = productIds.filter((id) => !byId.has(id));
    if (missing.length) {
      throw new BadRequestException({
        statusCode: 400,
        message: `Missing or unavailable products: ${missing.join(', ')}`,
        missingProductIds: missing,
      });
    }

    let storeId: string | null = null;
    let storeName: string | null = null;
    let distanceKm: number | null = null;
    let serviceable = true;
    let deliveryFeeRule: DeliveryFeeRule | null = null;

    if (address) {
      const resolved = await this.resolveStoreForLocation(address.latitude, address.longitude, normalizedItems);
      storeId = resolved.store.id;
      storeName = resolved.store.name;
      distanceKm = resolved.distanceKm;
      deliveryFeeRule = await this.deliveryFeeRules.resolve(address, resolved.store.id);
      const deliveryPricing = calculateDeliveryPricing(
        resolved.distanceKm,
        undefined,
        false,
        deliveryFeeRule ? this.deliveryFeeRules.toOverrides(deliveryFeeRule) : {},
      );
      serviceable = deliveryPricing.serviceable;
    } else {
      const store = await prisma.store.findFirst({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true } });
      if (store) {
        storeId = store.id;
        storeName = store.name;
      }
    }

    const inventoryByProduct = new Map<string, { quantity: number; sellingPricePaise: number | null; isListed: boolean }>();
    if (storeId) {
      const inventory = await prisma.inventory.findMany({
        where: { storeId, productId: { in: productIds } },
        select: { productId: true, quantity: true, sellingPricePaise: true, isListed: true },
      });
      for (const inv of inventory) inventoryByProduct.set(inv.productId, { quantity: inv.quantity, sellingPricePaise: inv.sellingPricePaise, isListed: inv.isListed });
    }

    const items = normalizedItems.map((i) => {
      const p = byId.get(i.productId)!;
      const inventoryRow = inventoryByProduct.get(i.productId);
      const availableQty = inventoryRow?.quantity ?? null;
      const inStock = availableQty === null ? true : Boolean(inventoryRow?.isListed && availableQty >= i.quantity);
      const basePricePaise = p.pricePaise || Math.round((Number(p.price) || 0) * 100);
      const unitPricePaise = inventoryRow?.sellingPricePaise ?? basePricePaise;
      const unitPrice = unitPricePaise / 100;
      const lineTotal = unitPrice * i.quantity;
      const lineTotalPaise = unitPricePaise * i.quantity;

      return {
        productId: p.id,
        categoryId: p.categoryId,
        name: p.name,
        image: p.image,
        quantity: i.quantity,
        unitPrice,
        lineTotal,
        unitPricePaise,
        lineTotalPaise,
        inStock,
        availableQty,
      };
    });

    const subtotal = items.reduce((sum, it) => sum + it.lineTotal, 0);
    const subtotalPaise = items.reduce((sum, it) => sum + it.lineTotalPaise, 0);
    const deliveryPricing = distanceKm === null
      ? null
      : calculateDeliveryPricing(
          distanceKm,
          subtotalPaise,
          firstOrderEligible,
          deliveryFeeRule ? this.deliveryFeeRules.toOverrides(deliveryFeeRule) : {},
        );
    const deliveryFeePaise = deliveryPricing?.serviceable ? deliveryPricing.payableFeePaise : 0;
    const deliveryFee = deliveryFeePaise / 100;
    const promotionPricing = storeId && this.promotionsService
      ? await this.promotionsService.calculateDiscount({
          userId,
          couponCode: dto.couponCode,
          storeId,
          subtotalPaise,
          deliveryFeePaise,
          lines: items.map((item) => ({
            productId: item.productId,
            categoryId: item.categoryId,
            lineTotalPaise: item.lineTotalPaise,
          })),
        })
      : { coupon: null, discountPaise: 0, eligibleSubtotalPaise: 0, ruleSnapshot: null };
    const grandTotalPaise = subtotalPaise + deliveryFeePaise - promotionPricing.discountPaise;
    const grandTotal = grandTotalPaise / 100;

    return {
      currency: 'INR',
      serviceable: deliveryPricing ? deliveryPricing.serviceable : serviceable,
      store: storeId ? { id: storeId, name: storeName } : null,
      distanceKm,
      etaMinutes: computeEtaMinutes(distanceKm),
      deliveryPricing,
      invoice: {
        items,
        subtotal,
        subtotalPaise,
        deliveryFee,
        deliveryFeePaise,
        discountAmount: promotionPricing.discountPaise / 100,
        discountPaise: promotionPricing.discountPaise,
        taxAmount: 0,
        taxPaise: 0,
        grandTotal,
        grandTotalPaise,
      },
      appliedCoupon: promotionPricing.coupon
        ? {
            ...promotionPricing.coupon,
            discountPaise: promotionPricing.discountPaise,
            discountAmount: promotionPricing.discountPaise / 100,
          }
        : null,
    };
  }
}
