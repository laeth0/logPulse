import { Check, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('tenants')
@Check('chk_tenants_email_non_empty', 'char_length(email) > 0')
export class Tenant {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_tenants' })
  id: string;

  @Column({ type: 'text', unique: true })
  email: string;

  @Column({ type: 'text' })
  password_hash: string;
}
