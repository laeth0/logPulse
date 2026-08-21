import { Column, Entity, PrimaryColumn } from 'typeorm';

import { LogLevel } from '@/logs/enums/log-level.enum';

@Entity('log_rollups')
export class LogRollup {
  @PrimaryColumn({
    type: 'timestamptz',
    primaryKeyConstraintName: 'pk_log_rollups',
  })
  bucket: Date;

  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_log_rollups' })
  tenant_id: string;

  @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'pk_log_rollups' })
  service: string;

  @PrimaryColumn({
    type: 'enum',
    enum: LogLevel,
    enumName: 'log_level',
    primaryKeyConstraintName: 'pk_log_rollups',
  })
  level: LogLevel;

  @Column({ type: 'integer', default: 0 })
  count: number;
}
