import { isOfflineSubscription } from '@aagam/utils';

/**
 * Temporary CI coverage for the shared online/offline classifier that now
 * drives the milk grid pill and both Subscribers tabs.
 */
describe('isOfflineSubscription', () => {
  it('treats a NULL source with an OFFLINE_STORE walk-in customer as offline (the A.vijay kumar case)', () => {
    expect(
      isOfflineSubscription({
        source: null,
        customer: {
          email: 'offline.7731829423@aagaam.local',
          phone: '7731829423',
          acquisitionSource: 'OFFLINE_STORE',
        },
      }),
    ).toBe(true);
  });

  it('treats a NULL source with no offline evidence as online (registered app customer)', () => {
    expect(
      isOfflineSubscription({
        source: null,
        customer: { email: 'user@example.com', phone: '9876543210', acquisitionSource: null },
      }),
    ).toBe(false);
  });

  it.each([['manual'], ['custom_manual']])('flags source=%s as offline', (source) => {
    expect(isOfflineSubscription({ source, customer: null })).toBe(true);
  });

  it('flags the synthetic offline phone prefix as offline', () => {
    expect(isOfflineSubscription({ source: null, customer: { phone: 'offline_123' } })).toBe(true);
  });

  it('does not flag a real registered email that merely starts with "offline."', () => {
    expect(
      isOfflineSubscription({
        source: null,
        customer: { email: 'offline.enquiries@gmail.com', phone: '9876543210', acquisitionSource: null },
      }),
    ).toBe(false);
  });

  it('flags acquisitionSource OFFLINE as offline', () => {
    expect(isOfflineSubscription({ source: null, customer: { acquisitionSource: 'OFFLINE' } })).toBe(true);
  });
});
