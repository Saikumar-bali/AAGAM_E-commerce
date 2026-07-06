import { create } from 'zustand';
import * as Keychain from 'react-native-keychain';
import { UserType } from '@aagam/types';
import { apiClient, setAuthToken } from '../api/client';
import { getFirebasePnvToken } from '../utils/firebasePnv';

interface AuthState {
  user: UserType | null;
  token: string | null;
  isLoading: boolean;
  setAuth: (user: UserType, token: string) => Promise<void>;
  login: (email: string, pass: string) => Promise<void>;
  googleLogin: (idToken: string) => Promise<void>;
  phonePnvLogin: (name?: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  signUp: (name: string, email: string, pass: string, role: string) => Promise<void>;
}

async function persistAuth(user: UserType, token: string) {
  await Keychain.setGenericPassword('auth', JSON.stringify({ user, token }));
  setAuthToken(token);
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
      const response = await apiClient.post('/auth/login', { email, password });
      const { user, access_token } = response.data;
      await persistAuth(user, access_token);
      set({ user, token: access_token, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw new Error(error.response?.data?.message || error.message || 'Login failed');
    }
  },
  googleLogin: async (idToken) => {
    try {
      set({ isLoading: true });
      const response = await apiClient.post('/auth/google', { idToken });
      const { user, access_token } = response.data;
      await persistAuth(user, access_token);
      set({ user, token: access_token, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw new Error(error.response?.data?.message || error.message || 'Google login failed');
    }
  },
  phonePnvLogin: async (name) => {
    try {
      set({ isLoading: true });
      const verified = await getFirebasePnvToken();
      const response = await apiClient.post('/auth/phone/pnv', { token: verified.token, name });
      const { user, access_token } = response.data;
      await persistAuth(user, access_token);
      set({ user, token: access_token, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw new Error(error.response?.data?.message || error.message || 'Phone login failed');
    }
  },
  signUp: async (name, email, password, role) => {
    try {
      set({ isLoading: true });
      await apiClient.post('/auth/signup', { name, email, password, role });
      const response = await apiClient.post('/auth/login', { email, password });
      const { user, access_token } = response.data;
      await persistAuth(user, access_token);
      set({ user, token: access_token, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw new Error(error.response?.data?.message || error.message || 'Registration failed');
    }
  },
  logout: async () => {
    try {
      await apiClient.post('/auth/logout');
      await Keychain.resetGenericPassword();
      setAuthToken(null);
      set({ user: null, token: null, isLoading: false });
    } catch (error) {
      await Keychain.resetGenericPassword();
      setAuthToken(null);
      set({ user: null, token: null, isLoading: false });
    }
  },
  initialize: async () => {
    try {
      const credentials = await Keychain.getGenericPassword();
      if (credentials) {
        const { token } = JSON.parse(credentials.password);
        setAuthToken(token);
        try {
          const response = await apiClient.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } });
          set({ user: response.data, token, isLoading: false });
        } catch (e) {
          await Keychain.resetGenericPassword();
          setAuthToken(null);
          set({ user: null, token: null, isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      set({ isLoading: false });
    }
  },
}));
