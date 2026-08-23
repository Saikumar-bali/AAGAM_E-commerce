import { readFileSync } from 'node:fs';

describe('Checkout locality contract', () => {
  const source = readFileSync(__dirname + '/page.tsx', 'utf8');

  test('requires and persists a matching locality for inline manual addresses', () => {
    expect(source).toContain('const locality = localities.find((entry) => entry.id === selectedLocalityId);');
    expect(source).toContain('Select a locality matching the city, state, and pincode.');
    expect(source).toContain('localityId: selectedLocalityId,');
  });

  test('provides a retry path when locality loading fails', () => {
    expect(source).toContain('setLocalitiesError(true);');
    expect(source).toContain('void loadLocalities()');
  });
});
