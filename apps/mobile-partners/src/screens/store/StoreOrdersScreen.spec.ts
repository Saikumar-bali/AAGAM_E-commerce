import fs from 'fs';
import path from 'path';
import { storeService } from '../../api/storeService';

jest.mock('../../api/storeService', () => ({
  storeService: {
    getMyStores: jest.fn(),
    getStoreOrders: jest.fn(),
  },
}));

describe('StoreOrdersScreen contracts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads orders for the selected store only', async () => {
    const orders = [{ id: 'o1', status: 'PENDING', grandTotal: 500 }];
    (storeService.getStoreOrders as jest.Mock).mockResolvedValue(orders);
    await expect(storeService.getStoreOrders('s1')).resolves.toEqual(orders);
    expect(storeService.getStoreOrders).toHaveBeenCalledWith('s1');
  });

  it('initializes selection from the dashboard route parameter', () => {
    const source = fs.readFileSync(path.join(__dirname, 'StoreOrdersScreen.tsx'), 'utf8');
    expect(source).toContain('route?.params?.storeId');
    expect(source).toContain('requestedStoreId');
  });

  it('opens the registered Operations tab with order and store context', () => {
    const source = fs.readFileSync(path.join(__dirname, 'StoreOrdersScreen.tsx'), 'utf8');
    expect(source).toContain("navigate?.('Operations', { orderId: order.id, storeId: activeStoreId })");
    expect(source).not.toContain("navigate?.('StoreDeliveryOps'");
  });
});
