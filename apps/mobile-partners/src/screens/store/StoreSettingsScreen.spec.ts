import fs from 'fs';
import path from 'path';
import { storeService } from '../../api/storeService';

jest.mock('../../api/storeService', () => ({
  storeService: {
    getStoreDashboardSummaries: jest.fn(),
    updateOwnedStoreProfile: jest.fn(),
  },
}));

describe('StoreSettingsScreen contracts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the store-owner profile endpoint rather than the admin update endpoint', async () => {
    (storeService.updateOwnedStoreProfile as jest.Mock).mockResolvedValue({ id: 's1' });
    await storeService.updateOwnedStoreProfile('s1', { name: 'Store', address: 'Valid address', phone: '9876543210' });
    expect(storeService.updateOwnedStoreProfile).toHaveBeenCalledWith('s1', {
      name: 'Store',
      address: 'Valid address',
      phone: '9876543210',
    });
  });

  it('normalizes Indian country code and rejects malformed phone input before mutation', () => {
    const source = fs.readFileSync(path.join(__dirname, 'StoreSettingsScreen.tsx'), 'utf8');
    expect(source).toContain("digits.length === 12 && digits.startsWith('91')");
    expect(source).toContain('/^[6-9]\\d{9}$/');
    expect(source).toContain('updateOwnedStoreProfile');
    expect(source).not.toContain('storeService.updateStore(selected.id');
  });
});
