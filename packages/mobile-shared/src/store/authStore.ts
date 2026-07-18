import { create } from 'zustand';
import * as Keychain from 'react-native-keychain';
import { UserType } from '@aagam/types';
import { apiClient, setAuthToken } from '../api/client';
import { disableCurrentMobilePushSubscription } from '../utils/notifications';

interface AuthState {
  user: UserType | null;
  token: string | null;
  isLoading: boolean;
  setAuth: (user: UserType, token: string) => Promise<void>;
  login: (email: string, pass: string) => Promise<void>;
  googleLogin: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  signUp: (
    name: string,
    email: string,
    pass: string,
    role?: 'CUSTOMER',
  ) => Promise<void>;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms),
    ),
  ]);
}

const KEYCHAIN_TIMEOUT = 5000;

async function persistAuth(user: UserType, token: string) {
  await withTimeout(
    Keychain.setGenericPassword('auth', JSON.stringify({ user, token })),
    KEYCHAIN_TIMEOUT,
  );
  setAuthToken(token);
}

async function clearLocalAuth() {
  await withTimeout(Keychain.resetGenericPassword(), KEYCHAIN_TIMEOUT).catch(
    () => undefined,
  );
  setAuthToken(null);
}

function mobileAuthError(error: any, fallback: string, stage: string) {
  const rawMessage = error?.response?.data?.message || error?.message;
  const message = Array.isArray(rawMessage)
    ? rawMessage.join(', ')
    : rawMessage || fallback;
  const wrapped = new Error(message) as Error & {
    code?: string | number;
    status?: number;
    stage?: string;
  };
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
  login: async (email, password) => {
    try {
      set({ isLoading: true });
      const response = await apiClient.post('/auth/mobile/login', {
        email,
        password,
      });
      const { user, access_token } = response.data;
      if (!access_token) {
        throw new Error('Mobile login did not return a bearer token');
      }
      await persistAuth(user, access_token);
      set({ user, token: access_token, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw mobileAuthError(error, 'Login failed', 'backend-api');
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
      if (!access_token) {
        throw new Error('Mobile Google login did not return a bearer token');
      }
      await persistAuth(user, access_token);
      set({ user, token: access_token, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw mobileAuthError(
        error,
        'Could not save the mobile session',
        'secure-storage',
      );
    }
  },
  signUp: async (name, email, password, role = 'CUSTOMER') => {
    if (role !== 'CUSTOMER') {
      throw new Error(
        'Public mobile signup is customer-only. Use Partner Applications for Rider or Store access.',
      );
    }
    try {
      set({ isLoading: true });
      await apiClient.post('/auth/signup', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      const response = await apiClient.post('/auth/mobile/login', {
        email: email.trim().toLowerCase(),
        password,
      });
      const { user, access_token } = response.data;
      if (!access_token) {
        throw new Error('Mobile login did not return a bearer token');
      }
      await persistAuth(user, access_token);
      set({ user, token: access_token, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw mobileAuthError(error, 'Customer registration failed', 'backend-api');
    }
  },
  logout: async () => {
    try {
      await disableCurrentMobilePushSubscription().catch(() => undefined);
      await apiClient.post('/auth/logout').catch(() => undefined);
    } finally {
      await clearLocalAuth();
      set({ user: null, token: null, isLoading: false });
    }
  },
  initialize: async () => {
    try {
      const credentials = await withTimeout(
        Keychain.getGenericPassword(),
        KEYCHAIN_TIMEOUT,
      );
      if (credentials) {
        const { token } = JSON.parse(credentials.password);
        setAuthToken(token);
        try {
          const response = await apiClient.get('/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          set({ user: response.data, token, isLoading: false });
        } catch {
          await clearLocalAuth();
          set({ user: null, token: null, isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ user: null, token: null, isLoading: false });
    }
  },
}));
