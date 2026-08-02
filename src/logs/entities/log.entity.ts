import {
  Entity,
  PrimaryGeneratedColumn,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
  Check,
} from 'typeorm';
import { LogLevel } from '@/logs/enums/log-level.enum';

@Entity('logs')
@Check('chk_logs_service_non_empty', 'char_length(service) > 0')
@Check('chk_logs_message_non_empty', 'char_length(message) > 0')
@Check('chk_logs_attributes_object', "jsonb_typeof(attributes) = 'object'")
@Check(
  'chk_logs_attributes_text_object',
  "jsonb_typeof(attributes_text) = 'object'",
)
@Index('idx_logs_service_timestamp_id', ['service', 'timestamp', 'id'])
@Index('idx_logs_level_timestamp_id', ['level', 'timestamp', 'id'])
export class Log {
  @PrimaryColumn({ type: 'timestamptz', primaryKeyConstraintName: 'pk_logs' })
  timestamp: Date;

  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_logs',
  })
  id: string;

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
  attributes: Record<string, any>;

  @Column({ type: 'jsonb', default: {} })
  attributes_text: Record<string, string>;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  ingested_at: Date;
}
