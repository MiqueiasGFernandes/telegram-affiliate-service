import { createHash } from 'node:crypto';
import { CronTime } from 'cron';

export type ExecutionMode = 'scheduled' | 'once';

export interface AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly executionMode: ExecutionMode;
  readonly logLevel: string;
  readonly scheduleCron: string;
  readonly scheduleTimezone: string;
  readonly runMaxDurationMs: number;
  readonly persistenceEnabled: boolean;
  readonly databaseUrl?: string;
  readonly databaseSsl: boolean;
  readonly databasePoolMax: number;
  readonly currency: string;
  readonly lowTicketMin: string;
  readonly lowTicketMax: string;
  readonly mediumTicketMin: string;
  readonly mediumTicketMax: string;
  readonly minimumDiscountPercent: string;
  readonly categoryIds: readonly string[];
  readonly meliSiteId: 'MLB';
  readonly meliClientId: string;
  readonly meliClientSecret: string;
  readonly meliRefreshToken: string;
  readonly meliHttpTimeoutMs: number;
  readonly meliMaxConcurrency: number;
  readonly meliMaxRetries: number;
  readonly affiliateEvidenceMode: 'manual-file';
  readonly affiliateEvidenceFile: string;
  readonly policyFingerprint: string;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function decimal(env: NodeJS.ProcessEnv, key: string, fallback?: string, scale = 2): string {
  const value = env[key]?.trim() || fallback;
  if (
    !value ||
    !/^(0|[1-9]\d*)(\.\d+)?$/.test(value) ||
    (value.split('.')[1]?.length ?? 0) > scale
  ) {
    throw new Error(`${key} must be a non-negative decimal using a dot separator`);
  }
  return value;
}

function integer(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number) {
  const raw = env[key]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function boolean(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = env[key]?.trim();
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${key} must be exactly true or false`);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function compareDecimal(left: string, right: string, scale = 2): number {
  const units = (value: string) => {
    const [whole = '0', fraction = ''] = value.split('.');
    return (
      BigInt(whole) * 10n ** BigInt(scale) +
      BigInt((fraction + '0'.repeat(scale)).slice(0, scale) || '0')
    );
  };
  const a = units(left);
  const b = units(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function parseEnvironment(env: NodeJS.ProcessEnv): AppConfig {
  const nodeEnv = env['NODE_ENV'] || 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) throw new Error('Invalid NODE_ENV');
  const executionMode = env['EXECUTION_MODE'] || 'scheduled';
  if (!['scheduled', 'once'].includes(executionMode)) throw new Error('Invalid EXECUTION_MODE');

  const scheduleCron = required(env, 'SCHEDULE_CRON');
  const scheduleTimezone = required(env, 'SCHEDULE_TIMEZONE');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: scheduleTimezone });
  } catch {
    throw new Error('SCHEDULE_TIMEZONE must be a valid IANA timezone');
  }
  try {
    new CronTime(scheduleCron, scheduleTimezone);
  } catch {
    throw new Error('SCHEDULE_CRON must be a valid cron expression for SCHEDULE_TIMEZONE');
  }

  const currency = env['AFFILIATE_CURRENCY'] || 'BRL';
  if (!/^[A-Z]{3}$/.test(currency))
    throw new Error('AFFILIATE_CURRENCY must be an ISO currency code');
  const lowTicketMin = decimal(env, 'LOW_TICKET_MIN');
  const lowTicketMax = decimal(env, 'LOW_TICKET_MAX');
  const mediumTicketMin = decimal(env, 'MEDIUM_TICKET_MIN');
  const mediumTicketMax = decimal(env, 'MEDIUM_TICKET_MAX');
  const minimumDiscountPercent = decimal(env, 'MIN_DISCOUNT_PERCENT', undefined, 4);
  if (compareDecimal(lowTicketMin, lowTicketMax, 2) > 0)
    throw new Error('LOW_TICKET_MIN exceeds LOW_TICKET_MAX');
  if (compareDecimal(mediumTicketMin, lowTicketMax, 2) <= 0)
    throw new Error('Ticket bands must not overlap');
  if (compareDecimal(mediumTicketMin, mediumTicketMax, 2) > 0)
    throw new Error('MEDIUM_TICKET_MIN exceeds MEDIUM_TICKET_MAX');
  if (
    compareDecimal(minimumDiscountPercent, '0', 4) <= 0 ||
    compareDecimal(minimumDiscountPercent, '100', 4) > 0
  ) {
    throw new Error('MIN_DISCOUNT_PERCENT must be greater than 0 and at most 100');
  }

  const categoryIds = required(env, 'MELI_CATEGORY_IDS')
    .split(',')
    .map((id) => id.trim());
  if (
    categoryIds.length < 1 ||
    categoryIds.length > 10 ||
    categoryIds.some((id) => !/^MLB\d+$/.test(id))
  ) {
    throw new Error('MELI_CATEGORY_IDS must contain 1 to 10 MLB category IDs');
  }
  if (new Set(categoryIds).size !== categoryIds.length)
    throw new Error('MELI_CATEGORY_IDS must be unique');

  const persistenceEnabled = boolean(env, 'PERSISTENCE_ENABLED', false);
  let databaseUrl: string | undefined;
  if (persistenceEnabled) {
    databaseUrl = required(env, 'DATABASE_URL');
    let parsed: URL;
    try {
      parsed = new URL(databaseUrl);
    } catch {
      throw new Error('DATABASE_URL must be a valid URL');
    }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol))
      throw new Error('DATABASE_URL must use PostgreSQL');
  }

  const affiliateEvidenceMode = env['AFFILIATE_EVIDENCE_MODE'] || 'manual-file';
  if (affiliateEvidenceMode !== 'manual-file')
    throw new Error('Only manual-file evidence is supported');
  const affiliateEvidenceFile = required(env, 'AFFILIATE_EVIDENCE_FILE');
  if (!affiliateEvidenceFile.startsWith('/'))
    throw new Error('AFFILIATE_EVIDENCE_FILE must be an absolute path');
  const meliSiteId = env['MELI_SITE_ID'] || 'MLB';
  if (meliSiteId !== 'MLB') throw new Error('Only MLB site is supported');

  const policyFingerprint = sha256(
    JSON.stringify({
      currency,
      lowTicketMin,
      lowTicketMax,
      mediumTicketMin,
      mediumTicketMax,
      minimumDiscountPercent,
      categoryIds: [...categoryIds].sort(),
    }),
  );
  return {
    nodeEnv: nodeEnv as AppConfig['nodeEnv'],
    executionMode: executionMode as ExecutionMode,
    logLevel: env['LOG_LEVEL'] || 'info',
    scheduleCron,
    scheduleTimezone,
    runMaxDurationMs: integer(env, 'RUN_MAX_DURATION_MS', 600_000, 1_000, 600_000),
    persistenceEnabled,
    ...(databaseUrl ? { databaseUrl } : {}),
    databaseSsl: persistenceEnabled ? boolean(env, 'DATABASE_SSL', false) : false,
    databasePoolMax: persistenceEnabled ? integer(env, 'DATABASE_POOL_MAX', 5, 1, 20) : 5,
    currency,
    lowTicketMin,
    lowTicketMax,
    mediumTicketMin,
    mediumTicketMax,
    minimumDiscountPercent,
    categoryIds,
    meliSiteId,
    meliClientId: required(env, 'MELI_CLIENT_ID'),
    meliClientSecret: required(env, 'MELI_CLIENT_SECRET'),
    meliRefreshToken: required(env, 'MELI_REFRESH_TOKEN'),
    meliHttpTimeoutMs: integer(env, 'MELI_HTTP_TIMEOUT_MS', 10_000, 1_000, 30_000),
    meliMaxConcurrency: integer(env, 'MELI_MAX_CONCURRENCY', 4, 1, 10),
    meliMaxRetries: integer(env, 'MELI_MAX_RETRIES', 3, 0, 5),
    affiliateEvidenceMode,
    affiliateEvidenceFile,
    policyFingerprint,
  };
}
