import { riderService } from '../../api/riderService';

jest.mock('../../api/riderService', () => ({
  riderService: {
    getWorkspace: jest.fn(),
  },
}));

describe('RiderHistoryScreen data layer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads assignment history via workspace', async () => {
    const workspace = {
      rider: { status: 'OFFLINE' },
      assignmentHistory: [
        {
          id: 'a1',
          status: 'ACCEPTED',
          offeredAt: '2025-01-01T10:00:00Z',
          respondedAt: '2025-01-01T10:01:00Z',
          deliveryJob: {
            id: 'j1',
            status: 'DELIVERED',
            order: { id: 'o1', store: { name: 'Store A' } },
          },
        },
        {
          id: 'a2',
          status: 'REJECTED',
          offeredAt: '2025-01-02T10:00:00Z',
          rejectionReason: 'RIDER_DECLINED',
          deliveryJob: {
            id: 'j2',
            status: 'WAITING_FOR_DISPATCH',
            order: { id: 'o2', store: { name: 'Store B' } },
          },
        },
      ],
      activeJob: null,
      pendingOffers: [],
    };
    (riderService.getWorkspace as jest.Mock).mockResolvedValue(workspace);
    const result = await riderService.getWorkspace();
    expect(result.assignmentHistory).toHaveLength(2);
  });

  it('filters out CREATED and OFFERED assignments', () => {
    const assignments = [
      { status: 'CREATED' },
      { status: 'OFFERED' },
      { status: 'ACCEPTED' },
      { status: 'REJECTED' },
      { status: 'EXPIRED' },
    ];
    const filtered = assignments.filter(
      (a) => !['CREATED', 'OFFERED'].includes(a.status),
    );
    expect(filtered).toHaveLength(3);
    expect(filtered.map((a) => a.status)).toEqual(['ACCEPTED', 'REJECTED', 'EXPIRED']);
  });
});
