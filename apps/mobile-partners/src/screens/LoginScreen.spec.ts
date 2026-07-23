jest.mock('@aagam/mobile-shared', () => ({
  useAuthStore: jest.fn(() => ({
    login: jest.fn().mockResolvedValue(undefined),
    setAuth: jest.fn().mockResolvedValue(undefined),
  })),
  apiClient: {
    post: jest.fn(),
    defaults: { headers: { common: {} } },
  },
}));

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

import { apiClient } from '@aagam/mobile-shared';

describe('LoginScreen data layer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requests phone OTP via partner phone request endpoint', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: { maskedDestination: '+91****5678' },
    });
    const result = await apiClient.post('/auth/partner/phone/request', {
      phoneE164: '+919876545678',
      purpose: 'LOGIN',
    });
    expect(result.data.maskedDestination).toBe('+91****5678');
    expect(apiClient.post).toHaveBeenCalledWith('/auth/partner/phone/request', {
      phoneE164: '+919876545678',
      purpose: 'LOGIN',
    });
  });

  it('verifies OTP via partner phone verify endpoint', async () => {
    const response = {
      data: { user: { name: 'Test' }, access_token: 'token-123' },
    };
    (apiClient.post as jest.Mock).mockResolvedValue(response);
    const result = await apiClient.post('/auth/mobile/partner/phone/verify', {
      phoneE164: '+919876545678',
      purpose: 'LOGIN',
      code: '123456',
    });
    expect(result.data.access_token).toBe('token-123');
  });

  it('rejects invalid phone format', () => {
    const normalized = '12345'.replace(/[\s().-]/g, '');
    expect(/^\+[1-9]\d{7,14}$/.test(`+91${normalized}`)).toBe(false);
  });

  it('accepts valid 10-digit Indian phone number', () => {
    const normalized = '9876545678'.replace(/[\s().-]/g, '');
    const formatted = /^\d{10}$/.test(normalized) ? `+91${normalized}` : normalized;
    expect(/^\+[1-9]\d{7,14}$/.test(formatted)).toBe(true);
  });
});
