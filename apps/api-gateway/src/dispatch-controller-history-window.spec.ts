import { BadRequestException } from '@nestjs/common';
import { DispatchController } from './orders/dispatch.controller';

describe('DispatchController Rider history window', () => {
  const fixedNow = Date.parse('2026-08-04T10:30:00.000Z');

  afterEach(() => jest.restoreAllMocks());

  it('accepts local midnight from 60 calendar days ago', () => {
    jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
    const dispatch = { getRiderWorkspace: jest.fn().mockReturnValue({ ok: true }) };
    const controller = new DispatchController(dispatch as any, {} as any, {} as any, {} as any);

    expect(controller.riderWorkspace(
      { user: { id: 'rider-1' } },
      '2026-06-04T18:30:00.000Z',
    )).toEqual({ ok: true });
    expect(dispatch.getRiderWorkspace).toHaveBeenCalledWith(
      'rider-1',
      new Date('2026-06-04T18:30:00.000Z'),
    );
  });

  it('still rejects dates outside the timezone-tolerant calendar window', () => {
    jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
    const controller = new DispatchController({} as any, {} as any, {} as any, {} as any);
    expect(() => controller.riderWorkspace(
      { user: { id: 'rider-1' } },
      '2026-06-03T10:29:59.000Z',
    )).toThrow(BadRequestException);
  });
});
