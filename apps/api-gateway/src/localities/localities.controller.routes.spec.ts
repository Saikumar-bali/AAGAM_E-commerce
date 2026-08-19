import 'reflect-metadata';
import { PATH_METADATA } from '@nestjs/common/constants';
import { LocalitiesController } from './localities.controller';
import { AdminLocalitiesController } from './admin-localities.controller';

describe('LocalitiesController routes', () => {
  it('registers the public collection under /localities', () => {
    expect(Reflect.getMetadata(PATH_METADATA, LocalitiesController)).toBe('localities');
  });

  it('registers listActive on the collection root', () => {
    expect(Reflect.getMetadata(PATH_METADATA, LocalitiesController.prototype.listActive)).toBe('/');
  });

  it('registers the admin collection under /admin/localities', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminLocalitiesController)).toBe('admin/localities');
  });

  it('registers admin list/create on the collection root', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminLocalitiesController.prototype.listAll)).toBe('/');
    expect(Reflect.getMetadata(PATH_METADATA, AdminLocalitiesController.prototype.create)).toBe('/');
  });

  it('registers admin per-locality id routes', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminLocalitiesController.prototype.update)).toBe(':id');
    expect(Reflect.getMetadata(PATH_METADATA, AdminLocalitiesController.prototype.remove)).toBe(':id');
  });
});