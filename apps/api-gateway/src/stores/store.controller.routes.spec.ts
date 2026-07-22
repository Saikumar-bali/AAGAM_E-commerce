import 'reflect-metadata';
import { PATH_METADATA } from '@nestjs/common/constants';
import { StoreController } from './store.controller';

describe('StoreController owner store routes', () => {
  it('registers both the canonical and backward-compatible paths', () => {
    const path = Reflect.getMetadata(
      PATH_METADATA,
      StoreController.prototype.findMyStores,
    );

    expect(path).toEqual(['my-stores', 'mine']);
  });
});
