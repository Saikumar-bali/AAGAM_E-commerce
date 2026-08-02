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
    const orders = [{ id: 'o1', status: 'PENDING', grandTotal: 500, items: [{ id: 'i1', quantity: 2, product: { name: 'Rice' } }] }];
    (storeService.getStoreOrders as jest.Mock).mockResolvedValue(orders);
    await expect(storeService.getStoreOrders('s1')).resolves.toEqual(orders);
    expect(storeService.getStoreOrders).toHaveBeenCalledWith('s1');
  });

  it('initializes selection from the dashboard route parameter', () => {
    const source = fs.readFileSync(path.join(__dirname, 'StoreOrdersScreen.tsx'), 'utf8');
    expect(source).toContain('route?.params?.storeId');
    expect(source).toContain('requestedStoreId');
  });

  it('renders the ordered products and quantities in the queue', () => {
    const source = fs.readFileSync(path.join(__dirname, 'StoreOrdersScreen.tsx'), 'utf8');
    expect(source).toContain('items.slice(0, 3).map');
    expect(source).toContain("item.product?.name || 'Product'");
    expect(source).toContain('Number(item.quantity || 0)');
    expect(source).toContain('totalUnits');
  });

  it('opens the dedicated fulfillment details stack with the selected order context', () => {
    const source = fs.readFileSync(path.join(__dirname, 'StoreOrdersScreen.tsx'), 'utf8');
    expect(source).toContain("navigation?.navigate?.('OrderDetails'");
    expect(source).toContain('orderId: item.id');
    expect(source).toContain('storeId: activeStoreId');
    expect(source).toContain('order: item');
    expect(source).not.toContain("navigate?.('Operations'");
    expect(source).not.toContain("navigate?.('StoreDeliveryOps'");
  });
});
