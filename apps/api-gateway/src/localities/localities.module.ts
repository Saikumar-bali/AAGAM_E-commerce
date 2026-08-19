import { Module } from '@nestjs/common';

import { GeoModule } from '../geo/geo.module';
import { AdminLocalitiesController } from './admin-localities.controller';
import { LocalitiesController } from './localities.controller';
import { LocalitiesService } from './localities.service';

@Module({
  imports: [GeoModule],
  controllers: [LocalitiesController, AdminLocalitiesController],
  providers: [LocalitiesService],
  exports: [LocalitiesService],
})
export class LocalitiesModule {}