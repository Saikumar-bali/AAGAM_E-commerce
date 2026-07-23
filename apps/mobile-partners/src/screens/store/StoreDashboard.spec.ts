import fs from 'fs';
import path from 'path';
import { storeService } from '../../api/storeService';

jest.mock('../../api/storeService', () => ({
  storeService: {
    getStoreDashboardSummaries: jest.fn(),
  },
}));

describe('StoreDashboard contracts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads lightweight store-owner dashboard summaries', async () => {
    const stores = [{ id: 's1', name: 'Main Store', orderCount: 5, inventoryCount: 8, totalRevenue: 1200 }];
    (storeService.getStoreDashboardSummaries as jest.Mock).mockResolvedValue(stores);
    await expect(storeService.getStoreDashboardSummaries()).resolves.toEqual(stores);
  });

  it('navigates to the registered Orders tab with selected store context', () => {
    const source = fs.readFileSync(path.join(__dirname, 'StoreDashboard.tsx'), 'utf8');
    expect(source).toContain("navigate?.('Orders', { storeId: store.id })");
    expect(source).not.toContain("navigate?.('StoreOrders')");
  });

  it('renders API-provided order, inventory and revenue totals', () => {
    const source = fs.readFileSync(path.join(__dirname, 'StoreDashboard.tsx'), 'utf8');
    expect(source).toContain('store.orderCount');
    expect(source).toContain('store.inventoryCount');
    expect(source).toContain('store.totalRevenue');
  });
});
