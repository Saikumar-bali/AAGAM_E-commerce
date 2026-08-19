import { LocalitiesService, normalizeAliases, normalizePincode } from './localities.service';

describe('LocalitiesService helpers', () => {
  it('normalizes a pincode to digits only', () => {
    expect(normalizePincode('531-001')).toBe('531001');
    expect(normalizePincode('531001a')).toBe('531001');
    expect(normalizePincode(null)).toBe('');
    expect(normalizePincode(undefined)).toBe('');
  });

  it('normalizes aliases by trimming and dropping empty values', () => {
    expect(normalizeAliases([' Bowluvada ', 'boluvada', '', '  '])).toEqual(['Bowluvada', 'boluvada']);
    expect(normalizeAliases(undefined)).toEqual([]);
  });

  it('uses explicit coordinates when provided', async () => {
    const geo = { forward: jest.fn() };
    const service = new LocalitiesService(geo as any);
    const result = await service.resolveCoordinates(
      { name: 'Bowluvada', city: 'Anakapalli', state: 'ANDHRA PRADESH', pincode: '531001' },
      17.66,
      83.01,
    );
    expect(result).toEqual({ latitude: 17.66, longitude: 83.01 });
    expect(geo.forward).not.toHaveBeenCalled();
  });

  it('geocodes via pincode when explicit coordinates are absent', async () => {
    const geo = { forward: jest.fn().mockResolvedValue({ ok: true, latitude: 17.7092, longitude: 82.9985 }) };
    const service = new LocalitiesService(geo as any);
    const result = await service.resolveCoordinates(
      { name: 'Bowluvada', city: 'Anakapalli', state: 'ANDHRA PRADESH', pincode: '531001' },
      undefined,
      undefined,
    );
    expect(result).toEqual({ latitude: 17.7092, longitude: 82.9985 });
    expect(geo.forward).toHaveBeenCalledTimes(1);
    expect(geo.forward.mock.calls[0][0].pincode).toBe('531001');
  });

  it('returns null coordinates when geocoding fails', async () => {
    const geo = { forward: jest.fn().mockResolvedValue({ ok: false, status: 0 }) };
    const service = new LocalitiesService(geo as any);
    const result = await service.resolveCoordinates(
      { name: 'Unknown Village', city: 'Unknown', state: 'X', pincode: '000000' },
      undefined,
      undefined,
    );
    expect(result).toEqual({ latitude: null, longitude: null });
  });
});