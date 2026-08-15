import { readFileSync } from 'node:fs';

describe('Web customer address validation contract', () => {
  const source = readFileSync(__dirname + '/page.tsx', 'utf8');

  test('validates the backend-required fields and map location before saving', () => {
    expect(source).toContain('validateDraft');
    expect(source).toContain('Recipient name is required (at least 2 characters).');
    expect(source).toContain('Enter a valid required phone number.');
    expect(source).toContain('Address Line 1 is required (at least 3 characters).');
    expect(source).toContain('City is required.');
    expect(source).toContain('State is required.');
    expect(source).toContain('A valid 6 digit pincode is required.');
    expect(source).toContain('Pin your delivery location using live location, search, or the map.');
  });

  test('renders red inline errors and keeps optional fields optional', () => {
    expect(source).toContain("error ? 'border-red-400");
    expect(source).toContain('role="alert"');
    expect(source).toContain('<Input required label="Recipient Name"');
    expect(source).toContain('<Input required label="Phone"');
    expect(source).toContain('<Input required label="Address Line 1"');
    expect(source).toContain('<Input label="Address Line 2"');
    expect(source).toContain('<Input label="Landmark"');
    expect(source).toContain('<Input label="Instructions"');
  });
});
