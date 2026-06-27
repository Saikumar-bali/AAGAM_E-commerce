import axios from 'axios';
import { API_URL } from '@env';

const BASE_URL = API_URL || 'https://aagam-api-production.up.railway.app';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

let authStoreToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authStoreToken = token;
};

apiClient.interceptors.request.use((config) => {
  if (authStoreToken) {
    config.headers.Authorization = `Bearer ${authStoreToken}`;
  }
  return config;
});
