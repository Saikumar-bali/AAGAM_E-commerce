type NotificationPreferenceChannels = {
  pushEnabled?: boolean | null;
  inAppEnabled?: boolean | null;
} | null | undefined;

/**
 * A recipient row drives both the durable inbox and external push delivery.
 * Suppress it only when the user has explicitly disabled both channels.
 */
export function shouldCreateNotificationRecipient(preference: NotificationPreferenceChannels) {
  return preference?.pushEnabled !== false || preference?.inAppEnabled !== false;
}
