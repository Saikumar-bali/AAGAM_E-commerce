import { apiClient } from './client';
import { storeService } from './storeService';

jest.mock('./client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

describe('storeService.getMyStores', () => {
  it('loads the authenticated owner stores from the canonical route', async () => {
    const stores = [{ id: 'store-a', name: 'Store A' }];
    const get = apiClient.get as jest.Mock;
    get.mockResolvedValueOnce({ data: stores });

    await expect(storeService.getMyStores()).resolves.toEqual(stores);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/stores/my-stores');
  });
});
