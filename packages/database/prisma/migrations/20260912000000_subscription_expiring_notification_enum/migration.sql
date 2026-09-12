-- Forward-only enum extension for subscription-expiry notification events.
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_EXPIRING';