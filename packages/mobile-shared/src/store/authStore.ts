import { create } from 'zustand';
import * as Keychain from 'react-native-keychain';
import { UserType } from '@aagam/types';
import { apiClient, setAuthToken } from '../api/client';
import { disableCurrentMobilePushSubscription } from '../utils/notifications';
import {
  decodeStoredMobileSession,
  encodeStoredMobileSession,
  shouldInvalidateStoredSession,
} from './authSession';

type PhonePurpose = 'LOGIN' | 'SIGNUP';
type PhoneRequestResult = {
  channel: 'PHONE';
  maskedDestination: string;
  expiresAt: string;
  correlationId?: string;
  code?: string;
};

type MobileSessionCleanup = () => void | Promise<void>;
const mobileSessionCleanupHandlers = new Set<MobileSessionCleanup>();

export function registerMobileSessionCleanup(handler: MobileSessionCleanup) {
  mobileSessionCleanupHandlers.add(handler);
  return () => mobileSessionCleanupHandlers.delete(handler);
}

async function runMobileSessionCleanup() {
  await Promise.allSettled(
    Array.from(mobileSessionCleanupHandlers, (handler) => Promise.resolve().then(handler)),
  );
}

interface AuthState {
  user: UserType | null;
  token: string | null;
  isLoading: boolean;
  setAuth: (user: UserType, token: string) => Promise<void>;
  login: (identifier: string, pass: string) => Promise<void>;
  requestPhoneOtp: (phoneE164: string, purpose: PhonePurpose) => Promise<PhoneRequestResult>;
  verifyPhoneOtp: (input: { phoneE164: string; purpose: PhonePurpose; code: string; name?: string; email?: string }) => Promise<void>;
  googleLogin: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  signUp: (name: string, email: string, pass: string, role?: 'CUSTOMER') => Promise<void>;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)),
  ]);
}

const KEYCHAIN_TIMEOUT = 8000;
const AUTH_KEYCHAIN_SERVICE = 'com.aagam.mobile.auth';
const KEYCHAIN_OPTIONS = {
  service: AUTH_KEYCHAIN_SERVICE,
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

let initializationPromise: Promise<void> | null = null;

async function persistAuth(user: UserType, token: string) {
  await withTimeout(
    Keychain.setGenericPassword('aagam-auth', encodeStoredMobileSession(user, token), KEYCHAIN_OPTIONS),
    KEYCHAIN_TIMEOUT,
  );
  setAuthToken(token);
}

async function readPersistedAuth(): Promise<{ user: UserType; token: string } | null> {
  const currentCredentials = await withTimeout(
    Keychain.getGenericPassword({ service: AUTH_KEYCHAIN_SERVICE }),
    KEYCHAIN_TIMEOUT,
  ).catch(() => false as const);

  if (currentCredentials) {
    const currentSession = decodeStoredMobileSession<UserType>(currentCredentials.password);
    if (currentSession) return { user: currentSession.user, token: currentSession.token };
    await Keychain.resetGenericPassword({ service: AUTH_KEYCHAIN_SERVICE }).catch(() => undefined);
  }

  const legacyCredentials = await withTimeout(Keychain.getGenericPassword(), KEYCHAIN_TIMEOUT).catch(
    () => false as const,
  );
  if (!legacyCredentials) return null;

  const legacySession = decodeStoredMobileSession<UserType>(legacyCredentials.password);
  if (!legacySession) {
    await Keychain.resetGenericPassword().catch(() => undefined);
    return null;
  }

  await persistAuth(legacySession.user, legacySession.token);
  await Keychain.resetGenericPassword().catch(() => undefined);
  return { user: legacySession.user, token: legacySession.token };
}

async function clearLocalAuth() {
  await Promise.all([
    withTimeout(Keychain.resetGenericPassword({ service: AUTH_KEYCHAIN_SERVICE }), KEYCHAIN_TIMEOUT).catch(
      () => undefined,
    ),
    withTimeout(Keychain.resetGenericPassword(), KEYCHAIN_TIMEOUT).catch(() => undefined),
  ]);
  setAuthToken(null);
}

async function invalidateMobileSession() {
  await runMobileSessionCleanup();
  await clearLocalAuth();
}

function mobileAuthError(error: any, fallback: string, stage: string) {
  const rawMessage = error?.response?.data?.message || error?.message;
  const message = Array.isArray(rawMessage) ? rawMessage.join(', ') : rawMessage || fallback;
  const wrapped = new Error(message) as Error & { code?: string | number; status?: number; stage?: string };
  wrapped.code = error?.code;
  wrapped.status = error?.response?.status;
  wrapped.stage = stage;
  return wrapped;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,

  setAuth: async (user, token) => {
    await persistAuth(user, token);
    set({ user, token, isLoading: false });
  },

  login: async (identifier, password) => {
    try {
      set({ isLoading: true });
      const response = await apiClient.post('/auth/mobile/login', { identifier, password });
      const { user, access_token } = response.data;
      if (!access_token) throw new Error('Mobile login did not return a bearer token');
      await persistAuth(user, access_token);
      set({ user, token: access_token, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw mobileAuthError(error, 'Login failed', 'backend-api');
    }
  },

  requestPhoneOtp: async (phoneE164, purpose) => {
    try {
      set({ isLoading: true });
      const response = await apiClient.post('/auth/phone/request', { phoneE164, purpose });
      set({ isLoading: false });
      return response.data as PhoneRequestResult;
    } catch (error: any) {
      set({ isLoading: false });
      throw mobileAuthError(error, 'Verification code could not be sent', 'backend-api');
    }
  },

  verifyPhoneOtp: async (input) => {
    try {
      set({ isLoading: true });
      const response = await apiClient.post('/auth/mobile/phone/verify', input);
      const { user, access_token } = response.data;
      if (!access_token) throw new Error('Phone verification did not return a mobile session');
      await persistAuth(user, access_token);
      set({ user, token: access_token, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw mobileAuthError(error, 'Phone verification failed', 'backend-api');
    }
  },

  googleLogin: async (idToken) => {
    let response: any;
    try {
      set({ isLoading: true });
      response = await apiClient.post('/auth/mobile/google', { idToken });
    } catch (error: any) {
      set({ isLoading: false });
      throw mobileAuthError(error, 'Google login failed', 'backend-api');
    }
    try {
      const { user, access_token } = response.data;
      if (!access_token) throw new Error('Mobile Google login did not return a bearer token');
      await persistAuth(user, access_token);
      set({ user, token: access_token, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw mobileAuthError(error, 'Could not save the mobile session', 'secure-storage');
    }
  },

  signUp: async (name, email, password, role = 'CUSTOMER') => {
    if (role !== 'CUSTOMER') {
      throw new Error('Public mobile signup is customer-only. Use Partner Applications for Rider or Store access.');
    }
    try {
      set({ isLoading: true });
      await apiClient.post('/auth/signup', { name: name.trim(), email: email.trim().toLowerCase(), password });
      const response = await apiClient.post('/auth/mobile/login', { identifier: email.trim().toLowerCase(), password });
      const { user, access_token } = response.data;
      if (!access_token) throw new Error('Mobile login did not return a bearer token');
      await persistAuth(user, access_token);
      set({ user, token: access_token, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw mobileAuthError(error, 'Customer registration failed', 'backend-api');
    }
  },

  logout: async () => {
    try {
      // Stop app-owned foreground/background services while the bearer token is
      // still available, then unregister push and close the backend session.
      await runMobileSessionCleanup();
      await disableCurrentMobilePushSubscription().catch(() => undefined);
      await apiClient.post('/auth/logout').catch(() => undefined);
    } finally {
      await clearLocalAuth();
      set({ user: null, token: null, isLoading: false });
    }
  },

  initialize: async () => {
    if (initializationPromise) return initializationPromise;

    initializationPromise = (async () => {
      set({ isLoading: true });
      try {
        const stored = await readPersistedAuth();
        if (!stored) {
          setAuthToken(null);
          set({ user: null, token: null, isLoading: false });
          return;
        }

        setAuthToken(stored.token);
        set({ user: stored.user, token: stored.token, isLoading: false });

        try {
          const response = await apiClient.get('/auth/me', {
            headers: { Authorization: `Bearer ${stored.token}` },
          });
          const refreshedUser = response.data as UserType;
          set({ user: refreshedUser, token: stored.token, isLoading: false });
          await persistAuth(refreshedUser, stored.token).catch(() => undefined);
        } catch (error: any) {
          if (shouldInvalidateStoredSession(error)) {
            await invalidateMobileSession();
            set({ user: null, token: null, isLoading: false });
          } else {
            set({ user: stored.user, token: stored.token, isLoading: false });
          }
        }
      } catch {
        set({ isLoading: false });
      } finally {
        initializationPromise = null;
      }
    })();

    return initializationPromise;
  },
}));
