import { Logger } from '@nestjs/common';
import type { LoggerPort } from '../../modules/affiliate-research/application/ports/out/research-ports.js';

const secretKeys = /token|secret|cookie|authorization|password|affiliateurl|databaseurl/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      secretKeys.test(key) ? '[REDACTED]' : sanitize(nested),
    ]),
  );
}

export class StructuredLogger implements LoggerPort {
  private readonly logger = new Logger('AffiliateResearch');
  info(event: string, fields: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({ event, ...(sanitize(fields) as object) }));
  }
  error(event: string, fields: Record<string, unknown>): void {
    this.logger.error(JSON.stringify({ event, ...(sanitize(fields) as object) }));
  }
}
