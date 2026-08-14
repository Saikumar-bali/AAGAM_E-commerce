import { BadRequestException } from '@nestjs/common';
import { CheckoutService } from './checkout.service';

describe('checkout preorder delivery windows', () => {
  const service = new CheckoutService({} as any, {} as any, undefined);
  const validate = (start?: string, end?: string) => (service as any).validateDeliveryWindow({
    deliveryWindowStart: start,
    deliveryWindowEnd: end,
  });

  test('keeps immediate checkout backward compatible', () => {
    expect(validate()).toBeNull();
  });

  test('requires a complete delivery window', () => {
    const start = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
    expect(() => validate(start)).toThrow(BadRequestException);
  });

  test('accepts a future delivery window inside the booking horizon', () => {
    const start = new Date(Date.now() + 2 * 60 * 60_000);
    const end = new Date(start.getTime() + 3 * 60 * 60_000);
    expect(validate(start.toISOString(), end.toISOString())).toEqual({ start, end });
  });

  test('rejects windows without minimum lead time', () => {
    const start = new Date(Date.now() + 5 * 60_000);
    const end = new Date(start.getTime() + 2 * 60 * 60_000);
    expect(() => validate(start.toISOString(), end.toISOString())).toThrow(/lead time/);
  });

  test('rejects inverted windows', () => {
    const start = new Date(Date.now() + 2 * 60 * 60_000);
    const end = new Date(start.getTime() - 60_000);
    expect(() => validate(start.toISOString(), end.toISOString())).toThrow('Invalid delivery window');
  });
});
