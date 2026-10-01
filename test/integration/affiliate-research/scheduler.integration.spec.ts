import { describe, expect, it, vi } from 'vitest';
import { parseEnvironment } from '../../../src/platform/config/environment-config.js';
import type { RunAffiliateResearchPort } from '../../../src/modules/affiliate-research/application/ports/in/run-affiliate-research.port.js';
import { AffiliateResearchJob } from '../../../src/modules/affiliate-research/infrastructure/scheduler/affiliate-research.job.js';

const validEnv = {
  NODE_ENV: 'test',
  SCHEDULE_CRON: '0 0 1 1 *',
  SCHEDULE_TIMEZONE: 'UTC',
  LOW_TICKET_MIN: '10',
  LOW_TICKET_MAX: '99.99',
  MEDIUM_TICKET_MIN: '100',
  MEDIUM_TICKET_MAX: '500',
  MIN_DISCOUNT_PERCENT: '10',
  MELI_CATEGORY_IDS: 'MLB123',
  MELI_CLIENT_ID: 'fake',
  MELI_CLIENT_SECRET: 'fake',
  MELI_REFRESH_TOKEN: 'fake',
  AFFILIATE_EVIDENCE_FILE: '/tmp/evidence.json',
};

describe('affiliate research scheduler', () => {
  it('registers one resident cron job and discards an overlapping tick', async () => {
    let release: (() => void) | undefined;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = vi.fn(async () => {
      await wait;
      return {};
    });
    const research = { execute } as unknown as RunAffiliateResearchPort;
    const job = new AffiliateResearchJob(
      parseEnvironment({ ...validEnv, EXECUTION_MODE: 'scheduled' }),
      research,
    );
    job.onApplicationBootstrap();
    const first = job.runScheduled(new Date());
    await job.runScheduled(new Date());
    expect(execute).toHaveBeenCalledTimes(1);
    release?.();
    await first;
    await job.onApplicationShutdown();
  });

  it('reuses the use case for once mode without registering a resident job', async () => {
    const execute = vi.fn(async () => ({}));
    const research = { execute } as unknown as RunAffiliateResearchPort;
    const job = new AffiliateResearchJob(
      parseEnvironment({ ...validEnv, EXECUTION_MODE: 'once' }),
      research,
    );
    job.onApplicationBootstrap();
    await job.runOnce();
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ mode: 'ONCE' }));
    await job.onApplicationShutdown();
  });
});
