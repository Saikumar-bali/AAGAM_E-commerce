import { storeService } from '../../api/storeService';

jest.mock('../../api/storeService', () => ({
  storeService: {
    getMyStores: jest.fn(),
    getStoreOrders: jest.fn(),
  },
}));

describe('StoreOrdersScreen data layer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads assigned stores', async () => {
    const stores = [{ id: 's1', name: 'Store A' }];
    (storeService.getMyStores as jest.Mock).mockResolvedValue(stores);
    const result = await storeService.getMyStores();
    expect(result).toEqual(stores);
  });

  it('loads orders for a specific store', async () => {
    const orders = [
      { id: 'o1', status: 'PENDING', grandTotal: 500 },
      { id: 'o2', status: 'DELIVERED', grandTotal: 1200 },
    ];
    (storeService.getStoreOrders as jest.Mock).mockResolvedValue(orders);
    const result = await storeService.getStoreOrders('s1');
    expect(result).toEqual(orders);
    expect(storeService.getStoreOrders).toHaveBeenCalledWith('s1');
  });

  it('returns empty array when no orders exist', async () => {
    (storeService.getStoreOrders as jest.Mock).mockResolvedValue([]);
    const result = await storeService.getStoreOrders('s1');
    expect(result).toEqual([]);
  });
});
