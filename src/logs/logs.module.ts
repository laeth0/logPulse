import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CursorService } from '@/logs/cursor/cursor.service';
import { Log } from '@/logs/entities/log.entity';
import { LogsController } from './logs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Log])],
  controllers: [LogsController],
  providers: [CursorService],
  exports: [CursorService],
})
export class LogsModule {}
