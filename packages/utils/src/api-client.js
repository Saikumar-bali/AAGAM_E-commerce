import axios from 'axios';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
export const apiClient = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});
// Interceptor to add JWT token to requests
apiClient.interceptors.request.use(async (config) => {
    // Logic to get token from storage (AsyncStorage for mobile, localStorage for web)
    // This will be implemented in the respective app layers
    return config;
});
//# sourceMappingURL=api-client.js.map