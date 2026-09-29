import {
  buildCustomerAddressPayload,
  getApiErrorMessage,
} from '@aagam/utils';

describe('customer address client contract', () => {
  const liveLocationAddress = {
    label: 'Home',
    recipientName: '',
    phoneE164: '',
    line1: '12 Beach Road',
    city: 'Visakhapatnam',
    state: 'Andhra Pradesh',
    pincode: '530001',
    country: 'IN',
    latitude: 17.7041,
    longitude: 83.2977,
  };

  test('uses the signed-in customer defaults for a live-location address', () => {
    expect(buildCustomerAddressPayload(liveLocationAddress, {
      fallbackProfile: { name: 'Saikumar Bali', phone: '9876543210' },
      isDefault: true,
    })).toMatchObject({
      recipientName: 'Saikumar Bali',
      phoneE164: '+919876543210',
      latitude: 17.7041,
      longitude: 83.2977,
      isDefault: true,
    });
  });

  test('rejects a one-character recipient before sending the API request', () => {
    expect(() => buildCustomerAddressPayload({
      ...liveLocationAddress,
      recipientName: 'S',
      phoneE164: '9876543210',
    })).toThrow('at least 2 characters');
  });

  test('turns class-validator arrays into a readable message', () => {
    expect(getApiErrorMessage({
      response: { data: { message: ['recipientName must be longer than or equal to 2 characters'] } },
    }, 'Failed')).toBe('recipientName must be longer than or equal to 2 characters');
  });
});
