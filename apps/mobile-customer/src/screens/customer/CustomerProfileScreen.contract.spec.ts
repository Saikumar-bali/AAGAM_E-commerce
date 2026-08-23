import { readFileSync } from 'node:fs';

describe('Customer profile address validation contract', () => {
  const source = readFileSync(__dirname + '/CustomerProfileScreen.tsx', 'utf8');

  test('requires textual address fields while location evidence follows the selected mode', () => {
    expect(source).toContain("{ key: 'recipientName', label: 'Recipient Name', required: true }");
    expect(source).toContain("{ key: 'phoneE164', label: 'Phone', required: true }");
    expect(source).toContain("{ key: 'line1', label: 'Address Line 1', required: true }");
    expect(source).toContain("{ key: 'city', label: 'City', required: true }");
    expect(source).toContain("{ key: 'state', label: 'State', required: true }");
    expect(source).toContain("{ key: 'pincode', label: 'Pincode', required: true }");
    expect(source).not.toContain("{ key: 'latitude', label: 'Latitude', required: true }");
    expect(source).not.toContain("{ key: 'longitude', label: 'Longitude', required: true }");
    expect(source).toContain("locationSource: 'GEOCODED' as LocationSource");
    expect(source).toContain("basePayload.locationSource = 'LIVE_GPS'");
    expect(source).toContain("basePayload.locationSource = 'MAP_PIN'");
    expect(source).toContain("basePayload.locationSource = 'GEOCODED'");
    expect(source).toContain('basePayload.locationAccuracyMetres = Number(draft.locationAccuracyMetres)');
    expect(source).toContain('basePayload.locationCapturedAt = draft.locationCapturedAt');
    expect(source).toContain('localityId: draft.locationSource === \'GEOCODED\' ? draft.selectedLocalityId : null');
    expect(source).toContain('Re-select a locality matching the city, state, and pincode.');
    expect(source).toContain('Could not load localities. Tap to retry.');
    expect(source).toContain('if (!route.params?.openAddressForm || !localitiesLoaded) return;');
    expect(source).toContain('onRequestClose={() => setLocalityModalVisible(false)}');
    expect(source).toContain("loc.state.toLowerCase() === (address?.state || '').toLowerCase()");
    expect(source).toContain('Use current location');
    expect(source).toContain('Enter manually');
    expect(source).toContain('inputError');
    expect(source).toContain('inputErrorText');
    expect(source).toContain('Fields marked in red must be corrected before saving.');
  });

  test('keeps optional address details optional', () => {
    expect(source).toContain("{ key: 'alternatePhoneE164', label: 'Alternate Phone' }");
    expect(source).toContain("{ key: 'line2', label: 'Address Line 2' }");
    expect(source).toContain("{ key: 'landmark', label: 'Landmark' }");
    expect(source).toContain("{ key: 'instructions', label: 'Instructions' }");
  });
});
