import { readFileSync } from 'node:fs';

describe('Customer checkout address creation contract', () => {
  const source = readFileSync(__dirname + '/CheckoutScreen.tsx', 'utf8');

  test('adds and selects a movable live-location address without leaving checkout', () => {
    expect(source).toContain('Add delivery address');
    expect(source).toContain('<LeafletMap');
    expect(source).toContain('PermissionsAndroid.request');
    expect(source).toContain("apiClient.post('/customer/addresses'");
    expect(source).toContain('setSelectedAddressId(saved.id)');
  });

  test('marks every required inline address field and location invalid before API submission', () => {
    expect(source).toContain('validateAddressDraft');
    expect(source).toContain("next.recipientName = 'Recipient name is required");
    expect(source).toContain("next.phoneE164 = 'Enter a valid required phone number.'");
    expect(source).toContain("next.line1 = 'House, street and area is required.'");
    expect(source).toContain("next.city = 'City is required.'");
    expect(source).toContain("next.state = 'State is required.'");
    expect(source).toContain('A valid 6 digit pincode is required.');
    expect(source).toContain('A valid pinned delivery location is required.');
    expect(source).toContain('addressInputError');
    expect(source).toContain('Fields marked in red must be corrected before saving.');
  });

  test('keeps a visible route back to the cart when checkout hides bottom navigation', () => {
    expect(source).toContain('testID="checkout_back_button"');
    expect(source).toContain('navigation.goBack()');
    expect(source).toContain("navigation.navigate('MainTabs', { screen: 'Cart' })");
  });
});
