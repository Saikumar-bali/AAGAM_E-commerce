import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('rider reassignment safety contract', () => {
  it('validates, releases, and creates the replacement offer in one transaction', () => {
    const controller = read('apps/api-gateway/src/orders/dispatch.controller.ts');
    const transactionStart = controller.indexOf('return await prisma.$transaction(');
    const releaseCall = controller.indexOf('this.workflow.transitionWithinTransaction(');
    const replacementOffer = controller.indexOf('const assignment = await tx.dispatchAssignment.create({');

    expect(controller).toContain('FROM "DeliveryJob"');
    expect(controller).toContain('FROM "RiderProfile"');
    expect(controller).toContain('FOR UPDATE');
    expect(controller).toContain('status: { in: ACTIVE_JOB_STATUSES as any }');
    expect(controller).toContain('OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]');
    expect(controller).toContain('Rider already has active offer');
    expect(controller).toContain('error?.code === "P2002" || error?.code === "P2034"');
    expect(transactionStart).toBeGreaterThan(-1);
    expect(releaseCall).toBeGreaterThan(transactionStart);
    expect(replacementOffer).toBeGreaterThan(releaseCall);
    expect(controller).toContain(
      'return this.reassignAtomically(orderId, dto.riderUserId, req.user)',
    );
    expect(controller).not.toContain('assertReassignmentTargetAvailable');
    expect(controller).not.toContain(
      'return this.dispatch.reassignOrder(orderId, dto.riderUserId, req.user)',
    );
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
