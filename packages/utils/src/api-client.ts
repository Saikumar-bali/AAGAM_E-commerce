import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest', // Basic CSRF protection
  },
});

// Interceptor to add JWT token to requests
apiClient.interceptors.request.use(async (config) => {
  config.withCredentials = true; // Force it
  console.log(`[apiClient v2] Requesting: ${config.method?.toUpperCase()} ${config.url}`);
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('[apiClient] 401 Unauthorized received');
    }
    return Promise.reject(error);
  }
);
