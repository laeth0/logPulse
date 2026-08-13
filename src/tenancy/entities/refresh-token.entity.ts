import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('tenant_refresh_tokens')
@Index('idx_tenant_refresh_tokens_tenant_id', ['tenant_id'])
export class TenantRefreshToken {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_tenant_refresh_tokens',
  })
  id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  @Column({ type: 'text', unique: true })
  token_hash: string;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  created_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at: Date | null;
}
