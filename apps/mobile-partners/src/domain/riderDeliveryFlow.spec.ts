import {
  buildRiderCompletionReceipt,
  deliveryFlowViewForStatus,
  formatRiderAddress,
  formatRupees,
} from './riderDeliveryFlow';
import type { RiderDeliveryJob } from './riderWorkspace';

const job: RiderDeliveryJob = {
  id: 'job-1',
  orderId: 'order-AGM774512',
  status: 'RIDER_AT_CUSTOMER',
  riderPayoutAmount: 76,
  order: {
    id: 'order-AGM774512',
    grandTotal: 540,
    items: [
      { id: 'one', quantity: 1 },
      { id: 'two', quantity: 1 },
    ],
  },
};

describe('rider delivery flow helpers', () => {
  it('routes active customer-delivery statuses to the approved screens', () => {
    expect(deliveryFlowViewForStatus('OUT_FOR_DELIVERY')).toBe('PROGRESS');
    expect(deliveryFlowViewForStatus('RIDER_AT_CUSTOMER')).toBe('ARRIVED');
    expect(deliveryFlowViewForStatus('DELIVERED')).toBe('COMPLETE');
    expect(deliveryFlowViewForStatus('RIDER_AT_STORE')).toBe('LEGACY');
    expect(deliveryFlowViewForStatus('OUT_FOR_DELIVERY', 'ISSUE')).toBe('ISSUE');
  });

  it('builds a truthful completion receipt from live order and COD data', () => {
    const receipt = buildRiderCompletionReceipt(job, {
      job: { ...job, riderPayoutAmount: 76 },
      operations: [],
      requirements: { deliveryOtpRequired: true, codCollectionRequired: true },
      otp: { issued: true },
      cod: {
        applicable: true,
        expectedAmountPaise: 54_000,
        collected: true,
        settled: false,
      },
      returnInspection: null,
    });

    expect(receipt).toMatchObject({
      itemCount: 2,
      paymentMethod: 'COD',
      orderAmount: 540,
      customerPaid: 540,
      earnings: 76,
    });
    expect(receipt.baseFare).toBeNull();
  });

  it('formats address and money without inventing missing data', () => {
    expect(formatRiderAddress({ line1: '12, Green Park', city: 'Gurugram', pincode: '122002' }))
      .toBe('12, Green Park, Gurugram, 122002');
    expect(formatRupees(540)).toBe('₹540.00');
    expect(formatRupees(null)).toBe('—');
  });
});
