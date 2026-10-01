import { describe, expect, it, vi } from 'vitest';
import { parseEnvironment } from '../../../src/platform/config/environment-config.js';
import type { ResearchExecutionStorePort } from '../../../src/modules/affiliate-research/application/ports/out/research-ports.js';
import { RetentionMaintenanceJob } from '../../../src/modules/affiliate-research/infrastructure/scheduler/retention-maintenance.job.js';

const config = (mode: 'once' | 'scheduled') =>
  parseEnvironment({
    NODE_ENV: 'test',
    EXECUTION_MODE: mode,
    SCHEDULE_CRON: '0 0 * * *',
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
  });

describe('retention maintenance', () => {
  it('purges using a rolling 90-day cutoff and prevents overlapping maintenance cycles', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const purgeExpired = vi.fn(async (_cutoff: Date) => {
      await gate;
      return 0;
    });
    const job = new RetentionMaintenanceJob(config('scheduled'), {
      purgeExpired,
    } as unknown as ResearchExecutionStorePort);
    const first = job.run();
    await job.run();
    expect(purgeExpired).toHaveBeenCalledTimes(1);
    const cutoff = purgeExpired.mock.calls[0]?.[0];
    expect(cutoff?.getTime()).toBeGreaterThan(Date.now() - 91 * 86400000);
    expect(cutoff?.getTime()).toBeLessThan(Date.now() - 89 * 86400000);
    finish();
    await first;
  });

  it('does not register maintenance in once mode and safely contains hourly failures', async () => {
    const purgeExpired = vi.fn().mockRejectedValue(new Error('sensitive database error'));
    const job = new RetentionMaintenanceJob(config('once'), {
      purgeExpired,
    } as unknown as ResearchExecutionStorePort);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    job.onApplicationBootstrap();
    await job.run();
    expect(purgeExpired).toHaveBeenCalledTimes(1);
    expect(stderr.mock.calls.join(' ')).not.toContain('sensitive');
    stderr.mockRestore();
    job.onApplicationShutdown();
  });
});
