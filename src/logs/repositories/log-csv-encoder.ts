import type { NewLog } from '@/logs/interfaces/log-repository.interface';

/**
 * Encodes validated logs as CSV text for `COPY logs (...) FROM STDIN WITH
 * (FORMAT csv)`. COPY is Postgres's fastest bulk-load path — it streams rows
 * over a single wire round trip instead of planning/binding a parameterized
 * INSERT per batch, which is what lets ingestion keep up with the 15k
 * logs/sec target under a 0.5 CPU application container.
 *
 * Every field is quoted because `service`/`message` are arbitrary user text
 * and `attributes`/`attributes_text` are JSON text, both of which may
 * contain commas, newlines, or quotes.
 */
export function encodeLogsAsCsv(logs: readonly NewLog[]): string {
  const rows = new Array<string>(logs.length);

  for (let index = 0; index < logs.length; index += 1) {
    rows[index] = encodeLogAsCsvRow(logs[index]);
  }

  return rows.join('\n') + '\n';
}

function encodeLogAsCsvRow(log: NewLog): string {
  return [
    quoteCsvField(log.timestamp.toISOString()),
    quoteCsvField(log.tenant_id),
    quoteCsvField(log.level),
    quoteCsvField(log.service),
    quoteCsvField(log.message),
    quoteCsvField(JSON.stringify(log.attributes)),
    quoteCsvField(JSON.stringify(log.attributes_text)),
  ].join(',');
}

function quoteCsvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
