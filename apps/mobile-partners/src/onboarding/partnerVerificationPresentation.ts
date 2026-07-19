import { PartnerApplicationEvent } from './types';

export type VerificationDeliveryPresentation = {
  state: 'CHECKING' | 'SENT' | 'FAILED' | 'UNKNOWN';
  title: string;
  message: string;
  provider?: string;
  failureCode?: string;
  correlationId?: string;
  expiresAt?: string;
};

function metadata(event?: PartnerApplicationEvent): Record<string, any> {
  return event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};
}

export function resolveVerificationDelivery(
  events: PartnerApplicationEvent[],
  channel: 'EMAIL' | 'PHONE',
  checked: boolean,
): VerificationDeliveryPresentation {
  if (!checked) {
    return {
      state: 'CHECKING',
      title: 'Checking delivery',
      message: 'Checking whether the verification provider accepted the latest code request.',
    };
  }

  const relevant = [...events]
    .filter((event) => {
      if (!['CONTACT_CODE_SENT', 'CONTACT_CODE_DELIVERY_FAILED'].includes(event.eventType)) {
        return false;
      }
      const eventChannel = String(metadata(event).channel || '').toUpperCase();
      return !eventChannel || eventChannel === channel;
    })
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )[0];

  if (!relevant) {
    return {
      state: 'UNKNOWN',
      title: 'No confirmed code delivery',
      message: 'No accepted delivery is recorded for this application. Send a new code before entering an OTP.',
    };
  }

  const details = metadata(relevant);
  if (relevant.eventType === 'CONTACT_CODE_DELIVERY_FAILED') {
    return {
      state: 'FAILED',
      title: 'Code was not sent',
      message:
        relevant.message ||
        'The verification provider did not accept the latest delivery request. Send a new code to retry.',
      provider: details.provider ? String(details.provider) : undefined,
      failureCode: details.failureCode ? String(details.failureCode) : undefined,
      correlationId: details.correlationId ? String(details.correlationId) : undefined,
    };
  }

  return {
    state: 'SENT',
    title: 'Code request accepted',
    message:
      'The email provider accepted the code request. Delivery can still be delayed or filtered by the receiving mailbox.',
    provider: details.provider ? String(details.provider) : undefined,
    correlationId: details.correlationId ? String(details.correlationId) : undefined,
    expiresAt: details.expiresAt ? String(details.expiresAt) : undefined,
  };
}

export function verificationRequestErrorMessage(error: any): string {
  const response = error?.response?.data;
  const raw = response?.message || error?.message || 'Verification delivery failed';
  const message = Array.isArray(raw) ? raw.join(', ') : String(raw);
  const code = response?.code || error?.safeCode;
  const correlationId = response?.correlationId || error?.correlationId;
  const references = [
    code ? `Code: ${String(code)}` : '',
    correlationId ? `Reference: ${String(correlationId)}` : '',
  ].filter(Boolean);
  return references.length ? `${message}\n\n${references.join('\n')}` : message;
}
