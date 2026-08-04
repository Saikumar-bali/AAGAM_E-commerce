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

  test('keeps a visible route back to the cart when checkout hides bottom navigation', () => {
    expect(source).toContain('testID="checkout_back_button"');
    expect(source).toContain('navigation.goBack()');
    expect(source).toContain("navigation.navigate('MainTabs', { screen: 'Cart' })");
  });
});
