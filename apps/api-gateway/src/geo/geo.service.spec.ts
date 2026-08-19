import axios from 'axios';
import { GeoService } from './geo.service';

const service = new GeoService();

function searchResponse(entries: Array<{ lat?: string; lon?: string; display_name?: string }> = []) {
  return { status: 200, data: entries };
}

function input(overrides: Partial<Parameters<GeoService['forward']>[0]> = {}) {
  return {
    line1: '3-3, bowluvada, anakapalli',
    line2: undefined,
    landmark: undefined,
    city: 'VISAKHAPATANAM',
    state: 'ANDHRAPRADESH',
    pincode: '531032',
    country: 'IN',
    ...overrides,
  };
}

describe('GeoService.forward', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the first query that resolves', async () => {
    const get = jest
      .spyOn(axios, 'get')
      .mockResolvedValueOnce(searchResponse([]))
      .mockResolvedValueOnce(
        searchResponse([{ lat: '17.7092', lon: '82.9985', display_name: '531032, Anakapalle, Andhra Pradesh, India' }]),
      );

    const result = await service.forward(input());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.latitude).toBeCloseTo(17.7092);
      expect(result.longitude).toBeCloseTo(82.9985);
    }
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('falls back to pincode when the full address text does not resolve', async () => {
    const get = jest
      .spyOn(axios, 'get')
      .mockResolvedValueOnce(searchResponse([]))
      .mockResolvedValueOnce(
        searchResponse([{ lat: '17.7092', lon: '82.9985', display_name: '531032, Anakapalle, Andhra Pradesh, India' }]),
      );

    const result = await service.forward(input({ line1: 'bowluvada' }));

    expect(result.ok).toBe(true);
    const qParams = (call: jest.SpyInstance, index: number) => call.mock.calls[index]?.[1]?.params?.q;
    expect(qParams(get, 0)).toContain('bowluvada');
    expect(qParams(get, 1)).toBe('531032');
  });

  it('falls back to city + state when pincode is also unknown', async () => {
    const get = jest
      .spyOn(axios, 'get')
      .mockResolvedValueOnce(searchResponse([]))
      .mockResolvedValueOnce(searchResponse([]))
      .mockResolvedValueOnce(
        searchResponse([{ lat: '17.6868', lon: '83.2185', display_name: 'Visakhapatnam, Andhra Pradesh, India' }]),
      );

    const result = await service.forward(input({ pincode: '999999' }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.latitude).toBeCloseTo(17.6868);
      expect(result.longitude).toBeCloseTo(83.2185);
    }
    const qParams = (call: jest.SpyInstance, index: number) => call.mock.calls[index]?.[1]?.params?.q;
    expect(qParams(get, 2)).toContain('VISAKHAPATANAM, ANDHRAPRADESH, India');
  });

  it('does not repeat the same candidate query twice', async () => {
    const calls: string[] = [];
    jest.spyOn(axios, 'get').mockImplementation(async (_url: string, config?: any) => {
      calls.push(config?.params?.q as string);
      return searchResponse([]);
    });

    await service.forward(input({ line1: '', city: 'VISAKHAPATANAM', state: 'ANDHRAPRADESH', pincode: '531032' }));

    expect(new Set(calls).size).toBe(calls.length);
  });

  it('returns ok:false when every candidate fails', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue(searchResponse([]));

    const result = await service.forward(input());

    expect(result.ok).toBe(false);
  });

  it('returns ok:false when a candidate request errors', async () => {
    jest.spyOn(axios, 'get').mockRejectedValue(new Error('network down'));

    const result = await service.forward(input());

    expect(result.ok).toBe(false);
  });
});
