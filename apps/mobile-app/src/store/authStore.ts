import { create } from 'zustand';
import * as Keychain from 'react-native-keychain';
import { UserType } from '@aagam/types';
import { apiClient } from '../api/client';

interface AuthState {
  user: UserType | null;
  token: string | null;
  isLoading: boolean;
  setAuth: (user: UserType, token: string) => Promise<void>;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  signUp: (name: string, email: string, pass: string, role: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,
  setAuth: async (user, token) => {
    await Keychain.setGenericPassword('auth', JSON.stringify({ user, token }));
    set({ user, token, isLoading: false });
  },
  login: async (email, password) => {
    try {
      set({ isLoading: true });
      console.log('[AuthStore] Attempting login for:', email);
      const response = await apiClient.post('/auth/login', { email, password });
      console.log('[AuthStore] Login response received');
      
      const { user, access_token } = response.data;
      await Keychain.setGenericPassword('auth', JSON.stringify({ user, token: access_token }));
      set({ user, token: access_token, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      console.error('[AuthStore] Login error:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        config: error.config?.url
      });
      throw new Error(error.response?.data?.message || 'Login failed - check server connection');
    }
  },
  signUp: async (name, email, password, role) => {
    try {
      set({ isLoading: true });
      console.log('[AuthStore] Attempting sign-up for:', email, 'as', role);
      const response = await apiClient.post('/auth/signup', { name, email, password, role });
      console.log('[AuthStore] Sign-up response received');
      
      const { user, access_token } = response.data;
      await Keychain.setGenericPassword('auth', JSON.stringify({ user, token: access_token }));
      set({ user, token: access_token, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      console.error('[AuthStore] Sign-up error:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        config: error.config?.url
      });
      throw new Error(error.response?.data?.message || 'Registration failed - check server connection');
    }
  },
  logout: async () => {
    try {
      await apiClient.post('/auth/logout');
      await Keychain.resetGenericPassword();
      set({ user: null, token: null, isLoading: false });
    } catch (error) {
      await Keychain.resetGenericPassword();
      set({ user: null, token: null, isLoading: false });
    }
  },
  initialize: async () => {
    try {
      const credentials = await Keychain.getGenericPassword();
      if (credentials) {
        const { user, token } = JSON.parse(credentials.password);
        // Verify token validity by calling /auth/me
        try {
          const response = await apiClient.get('/auth/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
          set({ user: response.data, token, isLoading: false });
        } catch (e) {
          await Keychain.resetGenericPassword();
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
