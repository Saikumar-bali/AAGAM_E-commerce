import { shouldCreateNotificationRecipient } from './notification-preferences';

describe('notification channel independence', () => {
  it('keeps Store order push eligible when only in-app alerts are disabled', () => {
    expect(shouldCreateNotificationRecipient({
      inAppEnabled: false,
      pushEnabled: true,
    })).toBe(true);
  });

  it('keeps the durable inbox when only push is disabled', () => {
    expect(shouldCreateNotificationRecipient({
      inAppEnabled: true,
      pushEnabled: false,
    })).toBe(true);
  });

  it('uses enabled defaults when no preference exists', () => {
    expect(shouldCreateNotificationRecipient(undefined)).toBe(true);
  });

  it('suppresses a recipient only when both channels are disabled', () => {
    expect(shouldCreateNotificationRecipient({
      inAppEnabled: false,
      pushEnabled: false,
    })).toBe(false);
  });
});
