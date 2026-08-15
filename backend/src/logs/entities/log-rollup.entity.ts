import { Column, Entity, PrimaryColumn } from 'typeorm';

import { LogLevel } from '@/logs/enums/log-level.enum';

/**
 * A derived, tenant-scoped, minute-granularity count — never a second
 * source of truth for `logs`. Written only via raw SQL (the ingest-flush
 * upsert in log.repository.ts, the migration backfill, and retention's
 * pruning statements), never through this entity's repository directly;
 * it exists as a TypeORM entity solely so the read path
 * (aggregation-query.builder.ts) can query it type-safely (see
 * specs/002-performance-optimization/data-model.md).
 *
 * A normal LOGGED table, not UNLOGGED — see data-model.md's "Table
 * durability" note; this is load-bearing for the atomic COPY+upsert
 * transaction's crash-consistency guarantee, not a style choice.
 */
@Entity('log_rollups')
export class LogRollup {
  @PrimaryColumn({
    type: 'timestamptz',
    primaryKeyConstraintName: 'pk_log_rollups',
  })
  bucket: Date;

  // No FK to tenants.id — same rationale as logs.tenant_id
  // (specs/001-multi-tenancy/research.md Decision 6).
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

  // bigint comes back from pg as a string to avoid precision loss, matching
  // this project's existing convention for other bigint columns.
  @Column({ type: 'bigint', default: 0 })
  count: string;
}
