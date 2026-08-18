import 'reflect-metadata';
import { PATH_METADATA } from '@nestjs/common/constants';
import { DeliveryFeeRulesController } from './delivery-fee-rules.controller';

describe('DeliveryFeeRulesController routes', () => {
  it('registers the admin collection routes under /admin/delivery-fee-rules', () => {
    const path = Reflect.getMetadata(
      PATH_METADATA,
      DeliveryFeeRulesController,
    );
    expect(path).toBe('admin/delivery-fee-rules');
  });

  it('registers list/create routes on the collection root', () => {
    expect(Reflect.getMetadata(PATH_METADATA, DeliveryFeeRulesController.prototype.listAll)).toBe('/');
    expect(Reflect.getMetadata(PATH_METADATA, DeliveryFeeRulesController.prototype.create)).toBe('/');
  });

  it('registers the match-test sub-route', () => {
    const path = Reflect.getMetadata(
      PATH_METADATA,
      DeliveryFeeRulesController.prototype.matchTest,
    );
    expect(path).toBe('match-test');
  });

  it('registers per-rule id routes', () => {
    expect(Reflect.getMetadata(PATH_METADATA, DeliveryFeeRulesController.prototype.update)).toBe(':id');
    expect(Reflect.getMetadata(PATH_METADATA, DeliveryFeeRulesController.prototype.remove)).toBe(':id');
  });
});