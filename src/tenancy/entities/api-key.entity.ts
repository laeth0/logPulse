import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ApiKeyStatus } from '@/tenancy/enums/api-key-status.enum';

@Entity('api_keys')
@Check('chk_api_keys_status_valid', "status IN ('active', 'revoked')")
@Index('idx_api_keys_tenant_id', ['tenant_id'])
export class ApiKey {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_api_keys' })
  id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  @Column({ type: 'text', unique: true })
  key_value: string;

  @Column({ type: 'text', default: ApiKeyStatus.ACTIVE })
  status: ApiKeyStatus;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  created_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revoked_at: Date | null;
}
