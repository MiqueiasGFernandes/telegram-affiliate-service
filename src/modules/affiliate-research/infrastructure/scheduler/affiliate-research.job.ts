import { randomUUID } from 'node:crypto';
import { CronJob } from 'cron';
import type { AppConfig } from '../../../../platform/config/environment-config.js';
import type { RunAffiliateResearchPort } from '../../application/ports/in/run-affiliate-research.port.js';

/** Owns one local cron registration; runs never overlap within this process. */
export class AffiliateResearchJob {
  private job?: CronJob;
  private running = false;
  private activeExecution: Promise<unknown> | undefined;

  constructor(
    private readonly config: AppConfig,
    private readonly research: RunAffiliateResearchPort,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.executionMode !== 'scheduled') return;
    this.job = new CronJob(
      this.config.scheduleCron,
      () => {
        void this.runScheduled(new Date());
      },
      undefined,
      true,
      this.config.scheduleTimezone,
    );
  }

  async runOnce(): Promise<void> {
    await this.research.execute({ scheduledFor: new Date(), mode: 'ONCE' });
  }

  async onApplicationShutdown(): Promise<void> {
    this.job?.stop();
    await this.activeExecution?.catch(() => undefined);
  }

  async runScheduled(scheduledFor: Date): Promise<void> {
    if (this.running) return;
    this.running = true;
    const execution = this.research.execute({ scheduledFor, mode: 'SCHEDULED' }).finally(() => {
      this.running = false;
    });
    this.activeExecution = execution;
    void execution.then(
      () => {
        if (this.activeExecution === execution) this.activeExecution = undefined;
      },
      () => {
        if (this.activeExecution === execution) this.activeExecution = undefined;
      },
    );
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        execution,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('RUN_MAX_DURATION_EXCEEDED')),
            this.config.runMaxDurationMs,
          );
        }),
      ]);
    } catch {
      // The use case emits a sanitized failure record; scheduler callbacks must not crash the process.
      process.stderr.write(
        `${JSON.stringify({ event: 'affiliate_research.job_failed', runId: randomUUID() })}\n`,
      );
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
