import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../../src/app.module.js';
import { RUN_AFFILIATE_RESEARCH } from '../../../src/modules/affiliate-research/application/ports/in/run-affiliate-research.port.js';

const names = [
  'NODE_ENV',
  'EXECUTION_MODE',
  'SCHEDULE_CRON',
  'SCHEDULE_TIMEZONE',
  'PERSISTENCE_ENABLED',
  'DATABASE_URL',
  'LOW_TICKET_MIN',
  'LOW_TICKET_MAX',
  'MEDIUM_TICKET_MIN',
  'MEDIUM_TICKET_MAX',
  'MIN_DISCOUNT_PERCENT',
  'MELI_CATEGORY_IDS',
  'MELI_CLIENT_ID',
  'MELI_CLIENT_SECRET',
  'MELI_REFRESH_TOKEN',
  'AFFILIATE_EVIDENCE_FILE',
] as const;
const original = new Map(names.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of names) {
    const value = original.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('disabled PostgreSQL persistence', () => {
  it('boots the routine with an unreachable DATABASE_URL and never creates a DataSource', async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      EXECUTION_MODE: 'once',
      SCHEDULE_CRON: '0 * * * *',
      SCHEDULE_TIMEZONE: 'America/Sao_Paulo',
      PERSISTENCE_ENABLED: 'false',
      DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:1/nope',
      LOW_TICKET_MIN: '10',
      LOW_TICKET_MAX: '99.99',
      MEDIUM_TICKET_MIN: '100',
      MEDIUM_TICKET_MAX: '500',
      MIN_DISCOUNT_PERCENT: '10',
      MELI_CATEGORY_IDS: 'MLB1',
      MELI_CLIENT_ID: 'test',
      MELI_CLIENT_SECRET: 'test',
      MELI_REFRESH_TOKEN: 'test',
      AFFILIATE_EVIDENCE_FILE: '/tmp/unused-evidence.json',
    });
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    try {
      expect(app.get(RUN_AFFILIATE_RESEARCH)).toBeDefined();
      expect(() => app.get(DataSource, { strict: false })).toThrow();
    } finally {
      await app.close();
    }
  });
});
