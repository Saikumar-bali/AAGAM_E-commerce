import { readFileSync } from 'node:fs';

describe('Customer profile address validation contract', () => {
  const source = readFileSync(__dirname + '/CustomerProfileScreen.tsx', 'utf8');

  test('matches backend required address fields and renders red inline errors', () => {
    expect(source).toContain("{ key: 'recipientName', label: 'Recipient Name', required: true }");
    expect(source).toContain("{ key: 'phoneE164', label: 'Phone', required: true }");
    expect(source).toContain("{ key: 'line1', label: 'Address Line 1', required: true }");
    expect(source).toContain("{ key: 'city', label: 'City', required: true }");
    expect(source).toContain("{ key: 'state', label: 'State', required: true }");
    expect(source).toContain("{ key: 'pincode', label: 'Pincode', required: true }");
    expect(source).toContain("{ key: 'latitude', label: 'Latitude', required: true }");
    expect(source).toContain("{ key: 'longitude', label: 'Longitude', required: true }");
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
