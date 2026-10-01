import { CronJob } from 'cron';
import type { ResearchExecutionStorePort } from '../../application/ports/out/research-ports.js';
import type { AppConfig } from '../../../../platform/config/environment-config.js';

const RETENTION_DAYS = 90;
const retentionCutoff = (now: Date): Date =>
  new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

/** Runs hourly only in resident mode; no catch-up is performed after downtime. */
export class RetentionMaintenanceJob {
  private cron?: CronJob;
  private running = false;

  constructor(
    private readonly config: AppConfig,
    private readonly store: ResearchExecutionStorePort,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.executionMode !== 'scheduled' || !this.config.persistenceEnabled) return;
    this.cron = new CronJob(
      '0 * * * *',
      () => {
        void this.run();
      },
      undefined,
      true,
      'UTC',
    );
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.store.purgeExpired(retentionCutoff(new Date()));
    } catch {
      process.stderr.write(`${JSON.stringify({ event: 'affiliate_research.retention_failed' })}\n`);
    } finally {
      this.running = false;
    }
  }

  onApplicationShutdown(): void {
    this.cron?.stop();
  }
}
