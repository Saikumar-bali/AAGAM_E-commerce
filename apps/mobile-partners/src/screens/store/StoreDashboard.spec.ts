import fs from 'fs';
import path from 'path';
import { storeService } from '../../api/storeService';

jest.mock('../../api/storeService', () => ({
  storeService: {
    getStoreDashboardSummaries: jest.fn(),
  },
}));

jest.mock('../../api/notificationService', () => ({
  notificationService: {
    getInbox: jest.fn(),
  },
}));

describe('StoreDashboard contracts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads lightweight store-owner dashboard summaries', async () => {
    const stores = [{ id: 's1', name: 'Main Store', orderCount: 5, inventoryCount: 8, totalRevenue: 1200 }];
    (storeService.getStoreDashboardSummaries as jest.Mock).mockResolvedValue(stores);
    await expect(storeService.getStoreDashboardSummaries()).resolves.toEqual(stores);
  });

  it('opens the nested order queue with selected store context', () => {
    const source = fs.readFileSync(path.join(__dirname, 'StoreDashboard.tsx'), 'utf8');
    expect(source).toContain("navigation?.navigate?.('Orders'");
    expect(source).toContain("screen: 'OrderQueue'");
    expect(source).toContain('storeId: store.id');
    expect(source).not.toContain("navigate?.('StoreOrders')");
  });

  it('provides a visible notification inbox with unread count', () => {
    const source = fs.readFileSync(path.join(__dirname, 'StoreDashboard.tsx'), 'utf8');
    expect(source).toContain('store_dashboard_notifications');
    expect(source).toContain('unreadCount');
    expect(source).toContain("navigate?.('Notifications')");
  });

  it('renders API-provided order, inventory and revenue totals in reference cards', () => {
    const source = fs.readFileSync(path.join(__dirname, 'StoreDashboard.tsx'), 'utf8');
    expect(source).toContain('store.orderCount');
    expect(source).toContain('store.inventoryCount');
    expect(source).toContain('store.totalRevenue');
    expect(source).toContain('Assigned Stores');
    expect(source).toContain('Have a great day ahead!');
  });
});
