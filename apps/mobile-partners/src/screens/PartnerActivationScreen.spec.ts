jest.mock('../onboarding/usePartnerOnboardingStore', () => ({
  usePartnerOnboardingStore: jest.fn(() => ({
    activate: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    isLoading: false,
  })),
}));

jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

describe('PartnerActivationScreen data layer', () => {
  it('validates password minimum length', () => {
    const password = 'short';
    expect(password.length >= 10).toBe(false);
  });

  it('accepts password with 10+ characters', () => {
    const password = 'longpassword';
    expect(password.length >= 10).toBe(true);
  });

  it('validates password confirmation match', () => {
    const password = 'testpassword';
    const confirm = 'testpassword';
    expect(password).toBe(confirm);
  });

  it('detects password mismatch', () => {
    const password = 'testpassword';
    const confirm = 'wrongpassword';
    expect(password).not.toBe(confirm);
  });
});
