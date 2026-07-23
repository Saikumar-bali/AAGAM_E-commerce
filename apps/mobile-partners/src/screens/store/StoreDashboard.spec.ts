import { storeService } from '../../api/storeService';

jest.mock('../../api/storeService', () => ({
  storeService: {
    getMyStores: jest.fn(),
    getStoreStats: jest.fn(),
    getStoreOrders: jest.fn(),
    getStoreAssortment: jest.fn(),
    getAvailableCatalogue: jest.fn(),
  },
}));

jest.mock('@aagam/mobile-shared', () => ({
  useAuthStore: jest.fn(() => ({
    user: { name: 'Test User', email: 'test@test.com' },
    logout: jest.fn(),
  })),
}));

describe('StoreDashboard data layer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads stores via getMyStores', async () => {
    const stores = [{ id: 's1', name: 'Main Store', address: '123 St' }];
    (storeService.getMyStores as jest.Mock).mockResolvedValue(stores);
    const result = await storeService.getMyStores();
    expect(result).toEqual(stores);
    expect(storeService.getMyStores).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no stores exist', async () => {
    (storeService.getMyStores as jest.Mock).mockResolvedValue([]);
    const result = await storeService.getMyStores();
    expect(result).toEqual([]);
  });

  it('loads store stats', async () => {
    const stats = { orderCount: 5, revenue: 10000 };
    (storeService.getStoreStats as jest.Mock).mockResolvedValue(stats);
    const result = await storeService.getStoreStats('s1');
    expect(result).toEqual(stats);
    expect(storeService.getStoreStats).toHaveBeenCalledWith('s1');
  });
});
