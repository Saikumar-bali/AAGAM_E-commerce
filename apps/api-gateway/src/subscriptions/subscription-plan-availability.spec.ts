import { NO_FULFILMENT_BINDING_MESSAGE, planAvailability } from './subscription-plan-availability';

describe('planAvailability', () => {
  it('marks a plan with a store binding as available', () => {
    expect(planAvailability({ storeCount: 1, zoneCount: 0 })).toEqual({
      isAvailable: true,
      availabilityIssue: null,
    });
  });

  it('marks a plan with only a zone binding as available', () => {
    expect(planAvailability({ storeCount: 0, zoneCount: 2 })).toEqual({
      isAvailable: true,
      availabilityIssue: null,
    });
  });

  it('marks a plan with neither binding as unavailable', () => {
    // This is the production state that made all 7 published plans unsellable:
    // stores=[] and zones=[] while status=ACTIVE.
    expect(planAvailability({ storeCount: 0, zoneCount: 0 })).toEqual({
      isAvailable: false,
      availabilityIssue: 'NO_FULFILMENT_BINDING',
    });
  });

  it('names the remediation in the operator-facing message', () => {
    expect(NO_FULFILMENT_BINDING_MESSAGE).toMatch(/store or delivery zone/i);
  });
});