/**
 * Checkout facade.
 *
 * Split out of the former checkout.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { Inject, Injectable, Optional } from '@nestjs/common';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { NotificationService } from '../notifications/notification.service';
import { PromotionsService } from '../promotions/promotions.service';
import { OrderCreationService } from '../orders/order-creation.service';
import { DeliveryFeeRulesService } from '../stores/delivery-fee-rules.service';
import { CheckoutServiceBase } from './checkout.service.base';
import { CheckoutServiceabilityService } from './checkout-serviceability.service';
import { CheckoutQuoteService } from './checkout-quote.service';
import { CheckoutPlaceOrderService } from './checkout-place-order.service';
import { CheckoutPlaceOrderDto, CheckoutQuoteDto } from './dto/checkout.dto';

export { applyFreeDeliveryThreshold, FREE_DELIVERY_MINIMUM_PAISE } from './delivery-pricing';

function isOrderCreationService(value?: OrderCreationService | PromotionsService): value is OrderCreationService {
  return !!value && typeof (value as OrderCreationService).createWithinTransaction === 'function';
}

@Injectable()
export class CheckoutService extends CheckoutServiceBase {
  private readonly orderCreation: OrderCreationService;
  private readonly promotionsService: PromotionsService | undefined;
  private readonly deliveryFeeRules: DeliveryFeeRulesService;
  private readonly serviceabilityService: CheckoutServiceabilityService;
  private readonly quoteService: CheckoutQuoteService;
  private readonly placeOrderService: CheckoutPlaceOrderService;

  constructor(
    private readonly trackingGateway: TrackingGateway,
    private readonly notificationService: NotificationService,
    @Inject(OrderCreationService)
    orderCreationOrPromotions?: OrderCreationService | PromotionsService,
    @Optional() promotionsService?: PromotionsService,
    @Optional() deliveryFeeRulesService?: DeliveryFeeRulesService,
  ) {
    super();
    if (isOrderCreationService(orderCreationOrPromotions)) {
      this.orderCreation = orderCreationOrPromotions;
      this.promotionsService = promotionsService;
    } else {
      // Preserve direct unit-test construction from before OrderCreationService was extracted.
      // Nest still injects OrderCreationService explicitly through @Inject in production.
      this.orderCreation = new OrderCreationService();
      this.promotionsService = orderCreationOrPromotions ?? promotionsService;
    }
    this.deliveryFeeRules = deliveryFeeRulesService ?? new DeliveryFeeRulesService();
    this.serviceabilityService = new CheckoutServiceabilityService(this.deliveryFeeRules);
    this.quoteService = new CheckoutQuoteService(this.deliveryFeeRules, this.promotionsService);
    this.placeOrderService = new CheckoutPlaceOrderService(
      this.orderCreation,
      this.promotionsService,
      this.trackingGateway,
      this.quoteService,
    );
  }

  async serviceability(userId: string, addressId: string) {
    return this.serviceabilityService.serviceability(userId, addressId);
  }

  async deliverySlots(userId: string, addressId: string) {
    return this.serviceabilityService.deliverySlots(userId, addressId);
  }

  async quote(userId: string, dto: CheckoutQuoteDto) {
    return this.quoteService.quote(userId, dto);
  }

  async placeOrder(userId: string, dto: CheckoutPlaceOrderDto, idempotencyKey?: string) {
    return this.placeOrderService.placeOrder(userId, dto, idempotencyKey);
  }
}
