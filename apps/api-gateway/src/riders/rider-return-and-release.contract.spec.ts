import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (relative: string) =>
  readFileSync(resolve(__dirname, relative), 'utf8');

describe('Rider failed-delivery return contract', () => {
  const operations = read('../orders/delivery-operations.service.ts');
  const controller = read('../orders/delivery-operations.controller.ts');

  it('lets the assigned rider return a parcel even when the policy suggested otherwise', () => {
    expect(operations).toContain('riderInitiated = false');
    expect(operations).toContain('if (!riderInitiated || actor.role !== Role.RIDER)');
    expect(operations).toContain('Assigned rider is returning the undelivered parcel to the store');
    expect(operations).toContain('DeliveryResolutionStatus.SUPERSEDED');
    expect(operations).toContain('DeliveryResolutionAction.RETURN_TO_STORE');
  });

  it('marks the return operation as rider initiated for auditing', () => {
    expect(operations).toContain('riderInitiated,');
    expect(operations).toContain('metadata: { phase3Operation: true, riderInitiated }');
  });

  it('derives the override flag from the authenticated rider role only', () => {
    expect(controller).toContain('const riderInitiated = req.user?.role === Role.RIDER;');
    expect(controller).toContain('riderInitiated');
  });
});

describe('Admin free-BUSY-rider contract', () => {
  const riderService = read('rider.service.ts');
  const riderController = read('rider.controller.ts');

  it('allows an administrator to release a BUSY rider without a fake GPS ping', () => {
    expect(riderService).toContain('const releasingBusy =');
    expect(riderService).toContain('!canReuseFreshAvailability &&');
    expect(riderService).toContain('!releasingBusy');
  });

  it('refuses to free a rider who still holds active work and explains why', () => {
    expect(riderService).toContain('private async blockingWork');
    expect(riderService).toContain('isOccupyingDeliveryJob(job)');
    expect(riderService).toContain('Complete or reassign them before making the Rider available.');
  });

  it('surfaces per-rider workload so the admin UI can decide and explain', () => {
    expect(riderService).toContain('async findAllWithWorkload');
    expect(riderService).toContain('canBeFreed');
    expect(riderController).toContain('this.riderService.findAllWithWorkload()');
  });
});
