import {
  Check,
  Column,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { LogLevel } from '@/logs/enums/log-level.enum';
import type { LogAttributeValue } from '@/logs/interfaces/log-attribute-value.type';

@Entity('logs')
@Check('chk_logs_service_non_empty', 'char_length(service) > 0')
@Check('chk_logs_message_non_empty', 'char_length(message) > 0')
@Check('chk_logs_attributes_object', "jsonb_typeof(attributes) = 'object'")
@Index('idx_logs_tenant_timestamp_id', ['tenant_id', 'timestamp', 'id'])
@Index('idx_logs_tenant_service_timestamp_id', [
  'tenant_id',
  'service',
  'timestamp',
  'id',
])
@Index('idx_logs_tenant_level_timestamp_id', [
  'tenant_id',
  'level',
  'timestamp',
  'id',
])
export class Log {
  @PrimaryColumn({ type: 'timestamptz', primaryKeyConstraintName: 'pk_logs' })
  timestamp: Date;

  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_logs',
  })
  id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  @Column({
    type: 'enum',
    enum: LogLevel,
    enumName: 'log_level',
  })
  level: LogLevel;

  @Column({ type: 'text' })
  service: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'jsonb', default: {} })
  attributes: Record<string, LogAttributeValue>;
}
