import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '@aagam/database';
import { AutoDispatchService } from './orders/auto-dispatch.service';

const root = resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('Auto-dispatch CI and dependency-injection contracts', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAutoDispatch = process.env.AUTO_DISPATCH_ENABLED;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalAutoDispatch === undefined) delete process.env.AUTO_DISPATCH_ENABLED;
    else process.env.AUTO_DISPATCH_ENABLED = originalAutoDispatch;
  });

  it('keeps seeded manual-dispatch E2E flows deterministic in test mode', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.AUTO_DISPATCH_ENABLED;
    const findJob = jest.spyOn(prisma.deliveryJob, 'findUnique');
    const service = new AutoDispatchService({ record: jest.fn() } as any);

    await service.dispatchNearestRider('job-test');

    expect(findJob).not.toHaveBeenCalled();
  });

  it('allows a dedicated test to opt into auto-dispatch explicitly', async () => {
    process.env.NODE_ENV = 'test';
    process.env.AUTO_DISPATCH_ENABLED = 'true';
    const findJob = jest.spyOn(prisma.deliveryJob, 'findUnique').mockResolvedValue(null as any);
    const service = new AutoDispatchService({ record: jest.fn() } as any);

    await service.dispatchNearestRider('job-enabled');

    expect(findJob).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'job-enabled' } }));
  });

  it('wires the rejection and expiry paths to the actual AutoDispatchService provider', () => {
    const orderModule = read('apps/api-gateway/src/orders/order.module.ts');
    const worker = read('apps/api-gateway/src/notifications/notification-worker.service.ts');

    expect(orderModule).toContain('new DispatchAssignmentService(jobs, workflow, events, autoDispatch)');
    expect(orderModule).toContain('AutoDispatchService,');
    expect(worker).toContain('moduleRef?.get(AutoDispatchService, { strict: false })');
    expect(worker).not.toContain("moduleRef.get('AutoDispatchService'");
  });
});
