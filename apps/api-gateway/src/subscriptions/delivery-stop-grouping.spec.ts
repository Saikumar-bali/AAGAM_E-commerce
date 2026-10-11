import {
  StopAddressLike,
  countAddressStops,
  groupStopsByAddress,
  stopAddressKey,
} from './delivery-stop-grouping';

const QA_STREET = {
  pincode: '530001',
  line1: '12-34 QA Street',
  latitude: 17.73724,
  longitude: 82.99552,
};

describe('delivery-stop-grouping', () => {
  it('counts each distinct coordinate as one stop', () => {
    const stops: StopAddressLike[] = [
      { id: 'a', deliveryLatitude: 17.73724, deliveryLongitude: 82.99552 },
      { id: 'b', deliveryLatitude: 17.73724, deliveryLongitude: 82.99552 },
      { id: 'c', deliveryLatitude: 17.73724, deliveryLongitude: 82.99552 },
      { id: 'd', deliveryLatitude: 17.73724, deliveryLongitude: 82.99552 },
      { id: 'e', deliveryLatitude: 17.71, deliveryLongitude: 82.98 },
      { id: 'f', deliveryLatitude: 17.72, deliveryLongitude: 82.99 },
    ];
    expect(countAddressStops(stops)).toBe(3);
  });

  it('groups a household with several subscriptions into one physical stop', () => {
    const stops: StopAddressLike[] = [
      { id: 's1', addressSnapshot: QA_STREET, deliveryJobId: 'job-1' },
      { id: 's2', addressSnapshot: QA_STREET, deliveryJobId: 'job-2' },
      { id: 's3', addressSnapshot: { ...QA_STREET, line1: 'E2E250717 12-34 QA Street' }, deliveryJobId: 'job-3' },
    ];
    const groups = groupStopsByAddress(stops);
    expect(groups).toHaveLength(1);
    expect(groups[0].stops.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(countAddressStops(stops)).toBe(1);
  });

  it('keys on coordinates even when address text differs', () => {
    const a: StopAddressLike = { id: 'a', addressSnapshot: { ...QA_STREET, line1: 'Offline Alpha Lane' } };
    const b: StopAddressLike = { id: 'b', addressSnapshot: { ...QA_STREET, line1: 'E2E698861 Offline Alpha Lane' } };
    expect(stopAddressKey(a)).toBe(stopAddressKey(b));
  });

  it('falls back to pincode+line when coordinates are absent', () => {
    const a: StopAddressLike = { id: 'a', addressSnapshot: { pincode: '531001', line1: '1-1-1 Main Street' } };
    const b: StopAddressLike = { id: 'b', addressSnapshot: { pincode: '531001', line1: '1-1-1 Main Street' } };
    const c: StopAddressLike = { id: 'c', addressSnapshot: { pincode: '531001', line1: '9-9-9 Other Street' } };
    expect(stopAddressKey(a)).toBe(stopAddressKey(b));
    expect(countAddressStops([a, b, c])).toBe(2);
  });

  it('reads coordinates from the subscription snapshot when the stop has none', () => {
    const stop: StopAddressLike = { id: 'a', addressSnapshot: QA_STREET };
    expect(stopAddressKey(stop)).toBe('point:17.73724:82.99552');
  });

  it('never merges two stops that only share a deliveryJobId with no point', () => {
    const a: StopAddressLike = { id: 'a', addressSnapshot: {}, deliveryJobId: 'job-1' };
    const b: StopAddressLike = { id: 'b', addressSnapshot: {}, deliveryJobId: 'job-1' };
    expect(countAddressStops([a, b])).toBe(1);
  });

  it('keys an unidentifiable stop deterministically on its row id', () => {
    const stop: StopAddressLike = { id: 'row-1', addressSnapshot: {} };
    expect(stopAddressKey(stop)).toBe('unknown:row-1');
    expect(stopAddressKey(stop)).toBe(stopAddressKey(stop));
  });

  it('does not merge two unidentifiable stops that have distinct row ids', () => {
    const a: StopAddressLike = { id: 'row-1', addressSnapshot: {} };
    const b: StopAddressLike = { id: 'row-2', addressSnapshot: {} };
    expect(countAddressStops([a, b])).toBe(2);
    expect(groupStopsByAddress([a, b])).toHaveLength(2);
  });

  it('is deterministic when an unidentifiable stop has no row id', () => {
    const stop: StopAddressLike = { addressSnapshot: {} };
    expect(stopAddressKey(stop)).toBe('unknown:anonymous');
    expect(stopAddressKey(stop)).toBe(stopAddressKey(stop));
  });
});
