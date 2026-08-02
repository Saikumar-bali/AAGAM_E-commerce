import type { PartnerNotification } from '../api/notificationService';
import {
  buildTodayJobList,
  compactAddress,
  historyItems,
  isNotificationUpdate,
  notificationSection,
  summarizeRiderWeek,
  summarizeTodayJobs,
  visualStatusForJob,
} from './riderReferenceUi';
import type {
  RiderAssignmentOffer,
  RiderDeliveryJob,
  RiderWorkspace,
} from './riderWorkspace';

const localIso = (day: number, hour: number) => new Date(2026, 7, day, hour, 0, 0, 0).toISOString();

const job = (status: RiderDeliveryJob['status'], id: string): RiderDeliveryJob => ({
  id: `job-${id}`,
  orderId: `order-${id}`,
  status,
  updatedAt: localIso(2, 9),
  riderPayoutAmount: 100,
  order: {
    id: `order-${id}`,
    deliveredAt: status === 'DELIVERED' ? localIso(2, 10) : null,
    deliveryLat: 17.45,
    deliveryLng: 78.39,
    store: {
      name: 'Aagaam Store',
      address: 'MG Road',
      latitude: 17.43,
      longitude: 78.40,
    },
    addressSnapshot: { line1: '12 Green Park', city: 'Hyderabad', pincode: '500001' },
  },
});

const assignment = (
  status: RiderAssignmentOffer['status'],
  deliveryStatus: RiderDeliveryJob['status'],
  id: string,
): RiderAssignmentOffer => ({
  id: `assignment-${id}`,
  deliveryJobId: `job-${id}`,
  status,
  offeredAt: localIso(2, 8),
  respondedAt: localIso(2, 9),
  payoutAmount: 100,
  deliveryJob: job(deliveryStatus, id),
});

describe('rider reference UI helpers', () => {
  it('builds and summarizes the live jobs list without duplicating an active order', () => {
    const active = job('OUT_FOR_DELIVERY', 'active');
    const workspace: RiderWorkspace = {
      rider: { id: 'rider-1', status: 'ONLINE' },
      activeJob: active,
      pendingOffers: [assignment('OFFERED', 'RIDER_ASSIGNED', 'offer')],
      assignmentHistory: [assignment('ACCEPTED', 'DELIVERED', 'complete')],
    };
    const items = buildTodayJobList(workspace, new Date(2026, 7, 2, 12));
    expect(items).toHaveLength(3);
    expect(summarizeTodayJobs(items)).toEqual({
      assigned: 3,
      completed: 1,
      inProgress: 1,
      pending: 1,
    });
  });

  it('maps terminal delivery states and formats addresses', () => {
    expect(visualStatusForJob(job('RETURNED_TO_STORE', 'returned'))).toBe('RETURNED');
    expect(visualStatusForJob(job('DELIVERY_FAILED', 'failed'))).toBe('CANCELLED');
    expect(compactAddress({ line1: '12 Green Park', city: 'Hyderabad', pincode: '500001' }))
      .toBe('12 Green Park, Hyderabad, 500001');
  });

  it('groups alert dates and identifies update notifications', () => {
    const now = new Date(2026, 7, 2, 18);
    expect(notificationSection(localIso(2, 9), now)).toBe('TODAY');
    expect(notificationSection(localIso(1, 23), now)).toBe('YESTERDAY');
    expect(notificationSection(localIso(30, 12), now)).toBe('OLDER');
    expect(isNotificationUpdate({ type: 'CUSTOMER_ADDRESS_UPDATE' } as PartnerNotification)).toBe(true);
    expect(isNotificationUpdate({ type: 'ASSIGNMENT_OFFERED' } as PartnerNotification)).toBe(false);
  });

  it('builds history outcomes and weekly payout totals from real assignments', () => {
    const completed = assignment('ACCEPTED', 'DELIVERED', 'one');
    const cancelled = assignment('REJECTED', 'CANCELLED', 'two');
    const workspace: RiderWorkspace = {
      rider: { id: 'rider-1', status: 'ONLINE' },
      activeJob: null,
      pendingOffers: [],
      assignmentHistory: [completed, cancelled],
    };
    expect(historyItems(workspace).map((item) => item.status)).toEqual(['CANCELLED', 'COMPLETED']);
    const summary = summarizeRiderWeek([completed, cancelled], new Date(2026, 7, 2, 12));
    expect(summary.total).toBe(100);
    expect(summary.completed).toBe(1);
    expect(summary.average).toBe(100);
  });
});
