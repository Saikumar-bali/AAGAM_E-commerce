import axios from 'axios';

function getBaseUrl() {
  const win = typeof globalThis !== 'undefined' ? (globalThis as any).window : undefined;
  if (win && win.location) {
    const host = win.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://127.0.0.1:3005';
    }
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3005';
}

export const apiClient = axios.create({
  baseURL: getBaseUrl(),
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

apiClient.interceptors.request.use(async (config) => {
  const win = typeof globalThis !== 'undefined' ? (globalThis as any).window : undefined;
  if (win && win.location) {
    const host = win.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      if (!config.baseURL || config.baseURL.includes('aagaam.in') || config.baseURL.includes('localhost:3005')) {
        config.baseURL = 'http://127.0.0.1:3005';
      }
    }
  }
  config.withCredentials = true;
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
    delete config.headers['content-type'];
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('[apiClient] 401 Unauthorized received');
    }
    return Promise.reject(error);
  },
);
