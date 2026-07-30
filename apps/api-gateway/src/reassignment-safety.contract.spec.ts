import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('rider reassignment safety contract', () => {
  it('rejects an unavailable target before releasing the current rider', () => {
    const controller = read('apps/api-gateway/src/orders/dispatch.controller.ts');
    const guardCall = controller.indexOf(
      'await this.assertReassignmentTargetAvailable(dto.riderUserId)',
    );
    const reassignCall = controller.indexOf(
      'return this.dispatch.reassignOrder(orderId, dto.riderUserId, req.user)',
    );

    expect(controller).toContain('status: { in: ACTIVE_JOB_STATUSES as any }');
    expect(controller).toContain('OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]');
    expect(controller).toContain('Rider already has active offer');
    expect(guardCall).toBeGreaterThan(-1);
    expect(reassignCall).toBeGreaterThan(guardCall);
  });

  it('only lists dispatchable riders in the admin reassignment modal', () => {
    const page = read('apps/admin-dashboard/src/app/(admin)/admin/orders/page.tsx');

    expect(page).toContain("apiClient.get('/orders/dispatch/board')");
    expect(page).toContain('offer.riderProfile?.id');
    expect(page).toContain(
      'rider.available && !openOfferRiderIds.has(rider.id)',
    );
    expect(page).not.toContain("apiClient.get('/riders')");
  });
});
