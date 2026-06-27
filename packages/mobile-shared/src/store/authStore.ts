import { create } from 'zustand';
import * as Keychain from 'react-native-keychain';
import { UserType } from '@aagam/types';
import { apiClient, setAuthToken } from '../api/client';

interface AuthState {
  user: UserType | null;
  token: string | null;
  isLoading: boolean;
  setAuth: (user: UserType, token: string) => Promise<void>;
  login: (email: string, pass: string) => Promise<void>;
  googleLogin: (idToken: string) => Promise<void>;
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
    setAuthToken(token);
    set({ user, token, isLoading: false });
  },
  login: async (email, password) => {
    try {
      set({ isLoading: true });
      const response = await apiClient.post('/auth/login', { email, password });
      const { user, access_token } = response.data;
      await Keychain.setGenericPassword('auth', JSON.stringify({ user, token: access_token }));
      setAuthToken(access_token);
      set({ user, token: access_token, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw new Error(error.response?.data?.message || 'Login failed');
    }
  },
  googleLogin: async (idToken) => {
    try {
      set({ isLoading: true });
      const response = await apiClient.post('/auth/google', { idToken });
      const { user, access_token } = response.data;
      await Keychain.setGenericPassword('auth', JSON.stringify({ user, token: access_token }));
      setAuthToken(access_token);
      set({ user, token: access_token, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw new Error(error.response?.data?.message || 'Google login failed');
    }
  },
  signUp: async (name, email, password, role) => {
    try {
      set({ isLoading: true });
      const response = await apiClient.post('/auth/signup', { name, email, password, role });
      const { user, access_token } = response.data;
      await Keychain.setGenericPassword('auth', JSON.stringify({ user, token: access_token }));
      setAuthToken(access_token);
      set({ user, token: access_token, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw new Error(error.response?.data?.message || 'Registration failed');
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
        const { user, token } = JSON.parse(credentials.password);
        setAuthToken(token);
        try {
          const response = await apiClient.get('/auth/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
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
