import {
  createVerificationHardwareBackHandler,
  resetVerificationToPartnerHome,
  resolveVerificationDelivery,
  verificationRequestErrorMessage,
} from './partnerVerificationPresentation';
import { PartnerApplicationEvent } from './types';

function event(
  eventType: string,
  metadata: Record<string, any> = {},
  createdAt = '2026-07-19T00:00:00.000Z',
): PartnerApplicationEvent {
  return {
    id: `${eventType}-${createdAt}`,
    eventType,
    actorKind: 'SYSTEM',
    message:
      eventType === 'CONTACT_CODE_DELIVERY_FAILED'
        ? 'Verification provider did not accept the delivery.'
        : 'Verification code accepted by mailjet.',
    metadata,
    createdAt,
  };
}

describe('partner verification back recovery', () => {
  it('resets the visible back action to Partner Home', () => {
    const navigation = { reset: jest.fn() };
    resetVerificationToPartnerHome(navigation);
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'PartnerWelcome' }],
    });
  });

  it('handles Android hardware back and consumes the event', () => {
    const navigation = { reset: jest.fn() };
    const handler = createVerificationHardwareBackHandler(navigation);
    expect(handler()).toBe(true);
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'PartnerWelcome' }],
    });
  });
});

describe('partner verification delivery presentation', () => {
  it('shows checking state before the event request completes', () => {
    expect(resolveVerificationDelivery([], 'EMAIL', false).state).toBe('CHECKING');
  });

  it('shows an accepted provider request without claiming inbox delivery', () => {
    const result = resolveVerificationDelivery(
      [
        event('CONTACT_CODE_SENT', {
          channel: 'EMAIL',
          provider: 'MAILJET',
          correlationId: 'accepted-reference',
          expiresAt: '2026-07-19T00:10:00.000Z',
        }),
      ],
      'EMAIL',
      true,
    );

    expect(result.state).toBe('SENT');
    expect(result.message).toContain('accepted');
    expect(result.message).toContain('filtered');
    expect(result.provider).toBe('MAILJET');
  });

  it('shows the latest safe provider failure code and correlation reference', () => {
    const result = resolveVerificationDelivery(
      [
        event(
          'CONTACT_CODE_SENT',
          { channel: 'EMAIL', provider: 'MAILJET' },
          '2026-07-19T00:00:00.000Z',
        ),
        event(
          'CONTACT_CODE_DELIVERY_FAILED',
          {
            channel: 'EMAIL',
            provider: 'MAILJET',
            failureCode: 'MAILJET_REJECTED',
            correlationId: 'failed-reference',
          },
          '2026-07-19T00:01:00.000Z',
        ),
      ],
      'EMAIL',
      true,
    );

    expect(result).toMatchObject({
      state: 'FAILED',
      provider: 'MAILJET',
      failureCode: 'MAILJET_REJECTED',
      correlationId: 'failed-reference',
    });
  });

  it('ignores delivery events for the other channel', () => {
    const result = resolveVerificationDelivery(
      [event('CONTACT_CODE_SENT', { channel: 'PHONE', provider: 'TWILIO' })],
      'EMAIL',
      true,
    );
    expect(result.state).toBe('UNKNOWN');
  });

  it('formats a safe provider error without credentials', () => {
    const message = verificationRequestErrorMessage({
      response: {
        data: {
          message: 'Partner email verification could not be delivered',
          code: 'MAILJET_AUTH_REJECTED',
          correlationId: 'correlation-1',
        },
      },
    });

    expect(message).toContain('MAILJET_AUTH_REJECTED');
    expect(message).toContain('correlation-1');
    expect(message).not.toContain('secret');
  });
});
