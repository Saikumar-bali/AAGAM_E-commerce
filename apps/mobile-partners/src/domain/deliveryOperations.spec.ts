import {
  buildInspectionLines,
  operationCompleted,
  riderOperationPolicy,
} from './deliveryOperations';

function summary(status: string, overrides: Record<string, any> = {}) {
  return {
    job: { status },
    operations: [],
    requirements: { deliveryOtpRequired: false, codCollectionRequired: false },
    otp: { issued: false },
    cod: { applicable: false, expectedAmountPaise: 0, collected: false, settled: false },
    returnInspection: null,
    ...overrides,
  } as any;
}

describe('Phase 3 mobile delivery operations policy', () => {
  it('exposes only valid rider actions for customer handoff', () => {
    const policy = riderOperationPolicy(summary('RIDER_AT_CUSTOMER'));
    expect(policy.issueOtp).toBe(true);
    expect(policy.completeDelivery).toBe(true);
    expect(policy.recordFailure).toBe(true);
    expect(policy.startReturn).toBe(false);
  });

  it('blocks required COD completion until exact collection is recorded', () => {
    const before = riderOperationPolicy(summary('RIDER_AT_CUSTOMER', {
      requirements: { deliveryOtpRequired: false, codCollectionRequired: true },
      cod: { applicable: true, expectedAmountPaise: 25000, collected: false, settled: false },
    }));
    expect(before.collectCod).toBe(true);
    expect(before.completeDelivery).toBe(false);

    const after = riderOperationPolicy(summary('RIDER_AT_CUSTOMER', {
      requirements: { deliveryOtpRequired: false, codCollectionRequired: true },
      cod: { applicable: true, expectedAmountPaise: 25000, collected: true, settled: false },
    }));
    expect(after.collectCod).toBe(false);
    expect(after.completeDelivery).toBe(true);
  });

  it('allows return start only after a recorded delivery failure', () => {
    expect(riderOperationPolicy(summary('OUT_FOR_DELIVERY')).startReturn).toBe(false);
    expect(riderOperationPolicy(summary('DELIVERY_FAILED')).startReturn).toBe(true);
    expect(riderOperationPolicy(summary('RETURNING_TO_STORE')).waitingForStoreReturn).toBe(true);
  });

  it('detects completed audit operations', () => {
    const value = summary('RETURNED_TO_STORE', {
      operations: [{ type: 'RETURN_INSPECTION_COMPLETED', status: 'COMPLETED' }],
    });
    expect(operationCompleted(value, 'RETURN_INSPECTION_COMPLETED')).toBe(true);
    expect(operationCompleted(value, 'COD_SETTLED')).toBe(false);
  });

  it('requires explicit inspection quantities for every returned unit', () => {
    expect(buildInspectionLines(
      [{ id: 'line-1', quantity: 3 }],
      { 'line-1': { sellable: '2', damaged: '1', missing: '0' } },
    )).toEqual([
      { orderItemId: 'line-1', disposition: 'SELLABLE', quantity: 2 },
      { orderItemId: 'line-1', disposition: 'DAMAGED', quantity: 1 },
    ]);

    expect(() => buildInspectionLines(
      [{ id: 'line-1', quantity: 3 }],
      { 'line-1': { sellable: '3', damaged: '1', missing: '0' } },
    )).toThrow('account for all 3 unit');
  });
});
