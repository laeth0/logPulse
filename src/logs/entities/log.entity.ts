import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { LogLevel } from '@/logs/enums/log-level.enum';
import type { LogAttributeValue } from '@/logs/interfaces/log-repository.interface';

@Entity('logs')
@Check('chk_logs_service_non_empty', 'char_length(service) > 0')
@Check('chk_logs_message_non_empty', 'char_length(message) > 0')
@Check('chk_logs_attributes_object', "jsonb_typeof(attributes) = 'object'")
@Check(
  'chk_logs_attributes_text_object',
  "jsonb_typeof(attributes_text) = 'object'",
)
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

  // No FK to tenants.id — see specs/001-multi-tenancy/research.md Decision 6:
  // tenant existence is guaranteed by construction (resolved credential or
  // DEFAULT_TENANT_ID), and an FK check would tax the hot COPY ingestion path
  // for no correctness benefit.
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

  @Column({ type: 'jsonb', default: {} })
  attributes_text: Record<string, string>;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  ingested_at: Date;
}
