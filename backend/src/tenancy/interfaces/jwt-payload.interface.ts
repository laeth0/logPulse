export interface TenantJwtPayload {
  sub: string;
  type: 'access' | 'refresh';
}
