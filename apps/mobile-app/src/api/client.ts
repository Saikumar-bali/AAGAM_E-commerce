import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { API_URL } from '@env';

// Mobile often fails to resolve @env during development due to cache.
// We use your computer's verified IP as a safe fallback.
const BASE_URL = API_URL || 'http://192.168.0.18:3005';

console.log('[API Client] Initializing with Base URL:', BASE_URL);

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
