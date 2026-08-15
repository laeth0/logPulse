export function bearer(credential: string): string {
  return `Bearer ${credential}`;
}
