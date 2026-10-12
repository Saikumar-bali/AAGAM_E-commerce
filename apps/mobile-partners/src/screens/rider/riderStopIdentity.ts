import type { DeliveryRunStop } from '../../api/subscriptionOperationsService';

// One customer may hold several subscriptions (a different plan, or the same
// plan in another slot) and each delivery becomes its own stop. The board row
// and the console sheet both flag those duplicates, so they must derive the
// identity identically or one surface shows a badge the other does not. Key on
// the subscription's real customer id first, then the same normalized
// phone/name fallbacks everywhere; the prefixes keep fields from colliding.
export function riderStopCustomerKey(stop: DeliveryRunStop): string {
  const subscriptionCustomerId = stop.subscriptionDelivery?.subscription?.customerId;
  if (subscriptionCustomerId) return `id:${subscriptionCustomerId}`;
  const customer = stop.deliveryJob?.order?.customer;
  const phone = customer?.phone?.trim();
  if (phone) return `phone:${phone}`;
  const name = customer?.name?.trim().toLowerCase();
  if (name) return `name:${name}`;
  return `stop:${stop.id}`;
}
