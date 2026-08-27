import axios from 'axios';
import { API_URL } from '@env';

const BASE_URL = (API_URL || 'https://aagaam.in/api').replace(/\/+$/, '');

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

let authStoreToken: string | null = null;
let unauthorizedLogout: Promise<void> | null = null;

export const setAuthToken = (token: string | null) => {
  authStoreToken = token;
};

apiClient.interceptors.request.use((config) => {
  const existingAuthorization = config.headers?.Authorization || config.headers?.authorization;
  if (authStoreToken && !existingAuthorization) {
    config.headers.Authorization = `Bearer ${authStoreToken}`;
  }
  return config;
});

const isPublicAuthRequest = (url?: string) => Boolean(
  url && [
    '/auth/mobile/login',
    '/auth/mobile/phone/verify',
    '/auth/mobile/google',
    '/auth/phone/request',
    '/auth/signup',
  ].some((path) => url.includes(path)),
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const requestUrl = error?.config?.url as string | undefined;

    // A rejected login/OTP request is not an expired authenticated session.
    // For authenticated 401s, clear the in-memory token immediately and run a
    // single durable logout even when several requests fail at the same time.
    const requestAuthorization = error?.config?.headers?.Authorization || error?.config?.headers?.authorization;
    const bearerSessionFailed = typeof requestAuthorization === 'string'
      && requestAuthorization === `Bearer ${authStoreToken}`;

    if (status === 401 && authStoreToken && bearerSessionFailed && !isPublicAuthRequest(requestUrl)) {
      authStoreToken = null;
      if (!unauthorizedLogout) {
        unauthorizedLogout = import('../store/authStore')
          .then(({ useAuthStore }) => useAuthStore.getState().logout())
          .catch(() => undefined)
          .finally(() => {
            unauthorizedLogout = null;
          });
      }
      await unauthorizedLogout;
    }

    return Promise.reject(error);
  },
);