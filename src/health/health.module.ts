import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [
    // Makes the default DataSource injectable via @InjectDataSource()
    // without importing individual entities — health only needs a raw connection.
    TypeOrmModule.forFeature([]),
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
