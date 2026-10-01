import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../../../src/platform/config/environment-config.js';

const valid = {
  SCHEDULE_CRON: '0 */6 * * *',
  SCHEDULE_TIMEZONE: 'America/Sao_Paulo',
  LOW_TICKET_MIN: '10.00',
  LOW_TICKET_MAX: '99.99',
  MEDIUM_TICKET_MIN: '100.00',
  MEDIUM_TICKET_MAX: '500.00',
  MIN_DISCOUNT_PERCENT: '10',
  MELI_CATEGORY_IDS: 'MLB1234',
  MELI_CLIENT_ID: 'test-client',
  MELI_CLIENT_SECRET: 'test-secret',
  MELI_REFRESH_TOKEN: 'test-refresh-token',
  AFFILIATE_EVIDENCE_FILE: '/tmp/affiliate-evidence.json',
};

describe('environment configuration', () => {
  it('requires a valid cron expression and IANA timezone in every execution mode', () => {
    expect(() => parseEnvironment({ ...valid, SCHEDULE_CRON: '' })).toThrow();
    expect(() => parseEnvironment({ ...valid, SCHEDULE_TIMEZONE: 'Invalid/Zone' })).toThrow();
    expect(parseEnvironment({ ...valid, EXECUTION_MODE: 'once' }).executionMode).toBe('once');
  });

  it('validates category count and persistence toggle strictly', () => {
    expect(() => parseEnvironment({ ...valid, MELI_CATEGORY_IDS: 'MLB1,MLB1' })).toThrow();
    expect(() => parseEnvironment({ ...valid, MELI_CATEGORY_IDS: '' })).toThrow();
    expect(() => parseEnvironment({ ...valid, PERSISTENCE_ENABLED: 'yes' })).toThrow();
  });
});
