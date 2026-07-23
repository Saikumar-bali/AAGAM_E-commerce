import fs from 'fs';
import path from 'path';
import {
  decodeStoredMobileSession,
  encodeStoredMobileSession,
  shouldInvalidateStoredSession,
} from '../../../../packages/mobile-shared/src/store/authSession';

describe('mobile session persistence', () => {
  const user = { id: 'store-owner-1', role: 'STORE_OWNER', email: 'store@example.com' };

  it('round-trips the current secure-storage payload', () => {
    expect(decodeStoredMobileSession(encodeStoredMobileSession(user, 'jwt-token'))).toEqual({
      version: 1,
      user,
      token: 'jwt-token',
    });
  });

  it('accepts the legacy payload so installed APK sessions can migrate', () => {
    expect(decodeStoredMobileSession(JSON.stringify({ user, token: 'legacy-token' }))).toEqual({
      version: 1,
      user,
      token: 'legacy-token',
    });
  });

  it.each(['', 'not-json', JSON.stringify({ user, token: '' }), JSON.stringify({ token: 'jwt-token' })])(
    'rejects malformed stored credentials: %s',
    (raw) => {
      expect(decodeStoredMobileSession(raw)).toBeNull();
    },
  );

  it('invalidates only an explicitly unauthorized session', () => {
    expect(shouldInvalidateStoredSession({ response: { status: 401 } })).toBe(true);
    expect(shouldInvalidateStoredSession({ response: { status: 403 } })).toBe(false);
    expect(shouldInvalidateStoredSession({ response: { status: 429 } })).toBe(false);
    expect(shouldInvalidateStoredSession({ response: { status: 503 } })).toBe(false);
    expect(shouldInvalidateStoredSession(new Error('Network Error'))).toBe(false);
  });

  it('restores stored state before remote validation and preserves it on transient failures', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../../packages/mobile-shared/src/store/authStore.ts'),
      'utf8',
    );

    expect(source).toContain("const AUTH_KEYCHAIN_SERVICE = 'com.aagam.mobile.auth'");
    expect(source).toContain('set({ user: stored.user, token: stored.token, isLoading: false });');
    expect(source).toContain('if (shouldInvalidateStoredSession(error))');
    expect(source).toContain('Keep the local session for network errors');
    expect(source).not.toContain('catch {\n          await clearLocalAuth();');
  });
});
