jest.mock('./client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import { apiClient } from './client';
import { deliveryOperationsService } from './deliveryOperationsService';

const post = apiClient.post as jest.Mock;

function idempotencyKey(callIndex: number) {
  return post.mock.calls[callIndex][2].headers['Idempotency-Key'];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('deliveryOperationsService.recordFailure', () => {
  it('reuses one key while retrying the same failed transport submission', async () => {
    post
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({ data: { operationId: 'failure-1' } });

    await expect(deliveryOperationsService.recordFailure('job-retry', {
      reason: 'CUSTOMER_UNREACHABLE',
    })).rejects.toThrow('network unavailable');

    await expect(deliveryOperationsService.recordFailure('job-retry', {
      reason: 'CUSTOMER_UNREACHABLE',
    })).resolves.toEqual({ operationId: 'failure-1' });

    expect(idempotencyKey(0)).toBe(idempotencyKey(1));
    expect(idempotencyKey(0)).toMatch(/^mobile-failure:job-retry:/);
  });

  it('rotates the key after success so a later redelivery attempt can fail independently', async () => {
    post
      .mockResolvedValueOnce({ data: { operationId: 'failure-1' } })
      .mockResolvedValueOnce({ data: { operationId: 'failure-2' } });

    await deliveryOperationsService.recordFailure('job-redelivery', {
      reason: 'ADDRESS_NOT_FOUND',
    });
    await deliveryOperationsService.recordFailure('job-redelivery', {
      reason: 'CUSTOMER_REFUSED',
    });

    expect(idempotencyKey(0)).not.toBe(idempotencyKey(1));
    expect(idempotencyKey(0)).toMatch(/^mobile-failure:job-redelivery:/);
    expect(idempotencyKey(1)).toMatch(/^mobile-failure:job-redelivery:/);
  });

  it('preserves a caller-supplied key for externally managed retries', async () => {
    post.mockResolvedValueOnce({ data: { operationId: 'failure-manual' } });

    await deliveryOperationsService.recordFailure(
      'job-manual',
      { reason: 'OTHER', note: 'Customer requested a later attempt.' },
      'manual-failure-key',
    );

    expect(idempotencyKey(0)).toBe('manual-failure-key');
  });
});
