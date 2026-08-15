import { DeliveryJobStatus } from '@aagam/types';
import { canAddOrderFromStore } from './same-store-multi-order';

describe('same-store multi-order eligibility', () => {
  it('allows any number of pre-pickup orders from the same store', () => {
    const jobs = Array.from({ length: 25 }, (_, index) => ({
      storeId: 'store-a',
      status: index % 2
        ? DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE
        : DeliveryJobStatus.RIDER_ASSIGNED,
    }));
    expect(canAddOrderFromStore(jobs, 'store-a')).toBe(true);
  });

  it('allows the first order', () => {
    expect(canAddOrderFromStore([], 'store-a')).toBe(true);
  });

  it('rejects another store', () => {
    expect(canAddOrderFromStore(
      [{ storeId: 'store-a', status: DeliveryJobStatus.RIDER_ASSIGNED }],
      'store-b',
    )).toBe(false);
  });

  it('rejects add-ons after pickup', () => {
    expect(canAddOrderFromStore(
      [{ storeId: 'store-a', status: DeliveryJobStatus.PICKUP_VERIFIED }],
      'store-a',
    )).toBe(false);
  });
});
