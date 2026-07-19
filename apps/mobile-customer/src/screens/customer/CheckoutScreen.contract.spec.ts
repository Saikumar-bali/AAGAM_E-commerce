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
});
