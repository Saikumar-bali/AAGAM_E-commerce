import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod, PaymentStatus, prisma } from '@aagam/database';
import { calculateDistance } from '@aagam/utils';

import { CheckoutPlaceOrderDto, CheckoutQuoteDto } from './dto/checkout.dto';
import { TrackingGateway } from '../tracking.gateway';
import { NotificationService } from '../notifications/notification.service';

const haversineKm = calculateDistance;

function computeDeliveryFee(distanceKm: number): { serviceable: boolean; deliveryFee: number } {
  if (!Number.isFinite(distanceKm)) return { serviceable: false, deliveryFee: 0 };
  if (distanceKm <= 3) return { serviceable: true, deliveryFee: 19 };
  if (distanceKm <= 6) return { serviceable: true, deliveryFee: 29 };
  if (distanceKm <= 8) return { serviceable: true, deliveryFee: 49 };
  return { serviceable: false, deliveryFee: 0 };
}

function computeEtaMinutes(distanceKm: number | null): number | null {
  if (distanceKm === null || !Number.isFinite(distanceKm)) return null;
  return Math.max(10, Math.ceil(distanceKm * 6 + 8));
}

function normalizeItems(items: Array<{ productId: string; quantity: number }>) {
  const byProduct = new Map<string, number>();
  for (const item of items) {
    const current = byProduct.get(item.productId) ?? 0;
    byProduct.set(item.productId, current + item.quantity);
  }
  return Array.from(byProduct.entries()).map(([productId, quantity]) => ({ productId, quantity }));
}

@Injectable()
export class CheckoutService {
  constructor(
    private readonly trackingGateway: TrackingGateway,
    private readonly notificationService: NotificationService
  ) {}

  private async resolveStoreForLocation(lat: number, lng: number) {
    const stores = await prisma.store.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, latitude: true, longitude: true },
    });
    if (stores.length === 0) {
      throw new NotFoundException('No active stores available');
    }

    let best = stores[0];
    let bestDistance = haversineKm(lat, lng, best.latitude, best.longitude);
    for (const s of stores.slice(1)) {
      const d = haversineKm(lat, lng, s.latitude, s.longitude);
      if (d < bestDistance) {
        bestDistance = d;
        best = s;
      }
    }

    return { store: best, distanceKm: bestDistance };
  }

  async serviceability(userId: string, addressId: string) {
    if (!addressId) throw new BadRequestException('addressId is required');
    const address = await prisma.customerAddress.findFirst({ where: { id: addressId, userId } });
    if (!address) throw new NotFoundException('Address not found');

    const resolved = await this.resolveStoreForLocation(address.latitude, address.longitude);
    const fee = computeDeliveryFee(resolved.distanceKm);

    return {
      serviceable: fee.serviceable,
      address: {
        id: address.id,
        label: address.label,
        line1: address.line1,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        latitude: address.latitude,
        longitude: address.longitude,
      },
      store: {
        id: resolved.store.id,
        name: resolved.store.name,
      },
      distanceKm: resolved.distanceKm,
      deliveryFee: fee.deliveryFee,
      deliveryFeePaise: Math.round(fee.deliveryFee * 100),
      etaMinutes: computeEtaMinutes(resolved.distanceKm),
    };
  }

  async quote(userId: string, dto: CheckoutQuoteDto) {
    if (!dto.items?.length) throw new BadRequestException('No items');
    const normalizedItems = normalizeItems(dto.items);

    const address = dto.addressId
      ? await prisma.customerAddress.findFirst({ where: { id: dto.addressId, userId } })
      : null;
    if (dto.addressId && !address) {
      throw new NotFoundException('Address not found');
    }

    const productIds = normalizedItems.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null, isActive: true },
      select: { id: true, name: true, price: true, pricePaise: true, image: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const missing = productIds.filter((id) => !byId.has(id));
    if (missing.length) {
      throw new BadRequestException(`Missing or unavailable products: ${missing.join(', ')}`);
    }

    let storeId: string | null = null;
    let storeName: string | null = null;
    let distanceKm: number | null = null;
    let deliveryFee = 0;
    let serviceable = true;

    if (address) {
      const resolved = await this.resolveStoreForLocation(address.latitude, address.longitude);
      storeId = resolved.store.id;
      storeName = resolved.store.name;
      distanceKm = resolved.distanceKm;
      const fee = computeDeliveryFee(resolved.distanceKm);
      serviceable = fee.serviceable;
      deliveryFee = fee.deliveryFee;
    } else {
      const store = await prisma.store.findFirst({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true } });
      if (store) {
        storeId = store.id;
        storeName = store.name;
      }
    }

    // Inventory check is store-specific. If we don't have an address/store, skip availability.
    const inventoryByProduct = new Map<string, number>();
    if (storeId) {
      const inventory = await prisma.inventory.findMany({
        where: { storeId, productId: { in: productIds } },
        select: { productId: true, quantity: true },
      });
      for (const inv of inventory) inventoryByProduct.set(inv.productId, inv.quantity);
    }

    const items = normalizedItems.map((i) => {
      const p = byId.get(i.productId)!;
      const availableQty = inventoryByProduct.has(i.productId) ? inventoryByProduct.get(i.productId)! : null;
      const inStock = availableQty === null ? true : availableQty >= i.quantity;
      const unitPrice = Number(p.price) || 0;
      const lineTotal = unitPrice * i.quantity;
      const unitPricePaise = p.pricePaise || Math.round(unitPrice * 100);
      const lineTotalPaise = unitPricePaise * i.quantity;

      return {
        productId: p.id,
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
    const deliveryFeePaise = Math.round(deliveryFee * 100);
    const grandTotalPaise = subtotalPaise + deliveryFeePaise;
    const grandTotal = subtotal + deliveryFee;

    return {
      currency: 'INR',
      serviceable,
      store: storeId ? { id: storeId, name: storeName } : null,
      distanceKm,
      etaMinutes: computeEtaMinutes(distanceKm),
      invoice: {
        items,
        subtotal,
        subtotalPaise,
        deliveryFee,
        deliveryFeePaise,
        discountAmount: 0,
        discountPaise: 0,
        taxAmount: 0,
        taxPaise: 0,
        grandTotal,
        grandTotalPaise,
      },
    };
  }

  async placeOrder(userId: string, dto: CheckoutPlaceOrderDto, idempotencyKey?: string) {
    const address = await prisma.customerAddress.findFirst({ where: { id: dto.addressId, userId } });
    if (!address) throw new NotFoundException('Address not found');
    if (!address.phoneE164) throw new BadRequestException('Delivery contact number missing for address');

    if (idempotencyKey) {
      const existing = await prisma.order.findFirst({ where: { idempotencyKey } });
      if (existing) {
        if (existing.customerId !== userId) {
          throw new ConflictException('Idempotency-Key already used');
        }
        return existing;
      }
    }

    // Validate quantities: must be positive integers
    for (const item of dto.items) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new BadRequestException(`Invalid quantity for product ${item.productId}: must be a positive integer`);
      }
    }

    const normalizedItems = normalizeItems(dto.items);
    const quote = await this.quote(userId, { items: normalizedItems, addressId: dto.addressId });
    if (!quote.serviceable) {
      throw new BadRequestException('Address is not serviceable');
    }

    // Validate grand total calculation
    const computedGrandTotalPaise = quote.invoice.subtotalPaise + quote.invoice.deliveryFeePaise + quote.invoice.taxPaise - quote.invoice.discountPaise;
    if (computedGrandTotalPaise !== quote.invoice.grandTotalPaise) {
      throw new Error('Grand total mismatch in pricing');
    }
    if (quote.invoice.grandTotalPaise < 0) {
      throw new BadRequestException('Grand total cannot be negative');
    }

    // Validate line totals
    for (const item of quote.invoice.items) {
      const expectedLineTotalPaise = item.unitPricePaise * item.quantity;
      if (expectedLineTotalPaise !== item.lineTotalPaise) {
        throw new Error(`Line total mismatch for ${item.name}`);
      }
    }

    const outOfStock = quote.invoice.items.filter((i) => i.inStock === false);
    if (outOfStock.length) {
      throw new BadRequestException(`Out of stock: ${outOfStock.map((i) => i.name).join(', ')}`);
    }

    const storeId = quote.store?.id;
    if (!storeId) throw new NotFoundException('No store available');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new NotFoundException('Customer not found');

    const orderStatus = dto.paymentMethod === PaymentMethod.COD ? 'CONFIRMED' : 'PAYMENT_PENDING';
    const paymentStatus = dto.paymentMethod === PaymentMethod.COD ? PaymentStatus.PENDING_COD : PaymentStatus.CREATED;

    const pricingSnapshot = {
      items: quote.invoice.items.map((it) => ({
        productId: it.productId,
        productName: it.name,
        quantity: it.quantity,
        unitPricePaise: it.unitPricePaise,
        lineTotalPaise: it.lineTotalPaise,
      })),
      subtotalPaise: quote.invoice.subtotalPaise,
      deliveryFeePaise: quote.invoice.deliveryFeePaise,
      discountPaise: quote.invoice.discountPaise,
      taxPaise: quote.invoice.taxPaise,
      grandTotalPaise: quote.invoice.grandTotalPaise,
      currency: 'INR',
      paymentMethod: dto.paymentMethod,
      calculatedAt: new Date().toISOString(),
      etaMinutes: quote.etaMinutes,
      distanceKm: quote.distanceKm,
    };

    return prisma.$transaction(async (tx) => {
      for (const item of quote.invoice.items) {
        const existing = await tx.inventory.findUnique({
          where: { storeId_productId: { storeId, productId: item.productId } },
        });
        const previousQuantity = existing?.quantity ?? 0;

        // Check inventory has enough stock
        if ((existing?.quantity ?? 0) < item.quantity) {
          throw new BadRequestException(`Insufficient inventory for ${item.name}: only ${existing?.quantity ?? 0} available`);
        }

        const reserved = await tx.inventory.updateMany({
          where: {
            storeId,
            productId: item.productId,
            quantity: { gte: item.quantity },
          },
          data: {
            quantity: {
              decrement: item.quantity,
            },
          },
        });

        if (reserved.count !== 1) {
          throw new BadRequestException(`Out of stock: ${item.name}`);
        }

        await tx.inventoryLedger.create({
          data: {
            storeId,
            productId: item.productId,
            orderId: null,
            reason: 'CHECKOUT_RESERVATION',
            quantityDelta: -item.quantity,
            previousQuantity,
            newQuantity: previousQuantity - item.quantity,
            actorUserId: userId,
            note: `Checkout reservation for ${item.name}`,
          },
        });
      }

      const created = await tx.order.create({
        data: {
          customerId: userId,
          storeId,
          status: orderStatus as any,
          ...(orderStatus === 'CONFIRMED' ? { confirmedAt: new Date() } : {}),
          totalAmount: quote.invoice.grandTotal,
          currency: 'INR',
          subtotal: quote.invoice.subtotal,
          deliveryFee: quote.invoice.deliveryFee,
          discountAmount: 0,
          taxAmount: 0,
          grandTotal: quote.invoice.grandTotal,
          subtotalPaise: quote.invoice.subtotalPaise,
          deliveryFeePaise: quote.invoice.deliveryFeePaise,
          discountPaise: 0,
          taxPaise: 0,
          grandTotalPaise: quote.invoice.grandTotalPaise,
          deliveryLat: address.latitude,
          deliveryLng: address.longitude,
          idempotencyKey: idempotencyKey || null,
          customerSnapshot: {
            id: user.id,
            email: user.email,
            name: user.name,
          },
          addressSnapshot: {
            id: address.id,
            label: address.label,
            recipientName: address.recipientName,
            phoneE164: address.phoneE164,
            alternatePhoneE164: (address as any).alternatePhoneE164,
            line1: address.line1,
            line2: address.line2,
            landmark: address.landmark,
            city: address.city,
            state: address.state,
            pincode: address.pincode,
            country: address.country,
            latitude: address.latitude,
            longitude: address.longitude,
            instructions: address.instructions,
          },
          itemsSnapshot: quote.invoice.items.map((it) => ({
            productId: it.productId,
            name: it.name,
            image: it.image,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            lineTotal: it.lineTotal,
            unitPricePaise: it.unitPricePaise,
            lineTotalPaise: it.lineTotalPaise,
          })),
          pricingSnapshot,
          items: {
            create: quote.invoice.items.map((it) => ({
              productId: it.productId,
              quantity: it.quantity,
              price: it.unitPrice,
              unitPricePaise: it.unitPricePaise,
              lineTotalPaise: it.lineTotalPaise,
            })),
          },
        },
        include: { items: true, store: { select: { name: true } } },
      });

      // Link ledger entries to the created order
      for (const item of quote.invoice.items) {
        await tx.inventoryLedger.updateMany({
          where: {
            storeId,
            productId: item.productId,
            orderId: null,
            reason: 'CHECKOUT_RESERVATION',
          },
          data: { orderId: created.id },
        });
      }

      await tx.payment.create({
        data: {
          orderId: created.id,
          method: dto.paymentMethod,
          status: paymentStatus,
          provider: dto.paymentMethod === PaymentMethod.COD ? 'COD' : 'SIMULATED',
          amount: quote.invoice.grandTotal,
          amountPaise: quote.invoice.grandTotalPaise,
          currency: 'INR',
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: created.id,
          fromStatus: null,
          toStatus: orderStatus as any,
          actorUserId: userId,
          actorRole: 'CUSTOMER',
          note: dto.paymentMethod === PaymentMethod.COD ? 'Order placed and confirmed' : 'Order placed, awaiting payment',
        },
      });

      // Emit Socket.IO event for real-time notifications
      try {
        const payload = {
          id: created.id,
          shortId: created.id.substring(0, 8).toUpperCase(),
          status: created.status,
          totalAmount: created.totalAmount,
          grandTotal: created.grandTotal,
          itemCount: created.items?.length ?? 0,
          paymentMethod: dto.paymentMethod,
          priority: dto.paymentMethod === PaymentMethod.COD ? 'HIGH' : 'NORMAL',
          createdAt: created.createdAt,
          store: { id: storeId, name: created.store?.name || null },
          customer: { name: user.name, email: user.email },
          delivery: {
            latitude: address.latitude,
            longitude: address.longitude,
            address: address.line1,
            city: address.city,
          },
        };
        this.trackingGateway.server?.to('admin_orders').emit('orderPlaced', payload);
        this.trackingGateway.server?.to('admin_monitor').emit('orderPlaced', payload);

        // Zone-based notification for riders (within ~5km)
        const zoneKey = `${Math.round(address.latitude * 10)}_${Math.round(address.longitude * 10)}`;
        this.trackingGateway.server?.to(`zone_${zoneKey}`).emit('newOrderNearby', payload);
        
        // Also emit to all riders queue (fallback)
        this.trackingGateway.server?.to('riders_queue').emit('newOrderNearby', payload);
        
        // Push Notification to Riders
        try {
          const riders = await prisma.user.findMany({
            where: { role: 'RIDER', fcmToken: { not: null } },
            select: { fcmToken: true },
          });
          console.log(`[CheckoutService] Rider push fanout count=${riders.length} for order=${created.id}`);

          const pushResults = await Promise.allSettled(
            riders
              .filter((rider) => !!rider.fcmToken)
              .map((rider) =>
                this.notificationService.sendNewOrderAlert(rider.fcmToken as string, {
                  orderId: created.id,
                  amount: created.grandTotal,
                  storeName: created.store?.name || 'Store',
                }),
              ),
          );

          const sent = pushResults.filter((r) => r.status === 'fulfilled').length;
          const failed = pushResults.filter((r) => r.status === 'rejected').length;
          console.log(`[CheckoutService] Rider push results sent=${sent} failed=${failed} order=${created.id}`);
        } catch (pushErr) {
          console.error('[CheckoutService] Failed to send push notifications:', pushErr);
        }
      } catch (err) {
        console.error('[CheckoutService] Failed to emit order events:', err);
        // Non-fatal - don't fail order placement if Socket/Push emit fails
      }

      return created;
    });
  }
}
