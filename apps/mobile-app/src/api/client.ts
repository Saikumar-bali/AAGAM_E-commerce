import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { API_URL } from '@env';

// Keep production APKs independent from localhost/LAN addresses.
const BASE_URL = API_URL || 'https://aagam-api-production.up.railway.app';

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
