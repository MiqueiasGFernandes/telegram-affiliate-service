import { DataSource } from 'typeorm';
import type {
  ResearchExecutionStorePort,
  RunSummaryRecord,
} from '../../../application/ports/out/research-ports.js';

/** PostgreSQL adapter; migrations are deliberately explicit (no synchronize at runtime). */
export class PostgresResearchExecutionStore implements ResearchExecutionStorePort {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleDestroy(): Promise<void> {
    if (this.dataSource.isInitialized) await this.dataSource.destroy();
  }

  async begin(input: { executionKey: string; runId: string; startedAt: Date }): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO research_execution (execution_key, run_id, status, started_at)
       VALUES ($1, $2, 'RUNNING', $3)
       ON CONFLICT (execution_key) DO NOTHING`,
      [input.executionKey, input.runId, input.startedAt],
    );
    const rows = (await this.dataSource.query(
      'SELECT run_id, status FROM research_execution WHERE execution_key = $1',
      [input.executionKey],
    )) as { run_id: string; status: string }[];
    if (rows[0]?.run_id !== input.runId) throw new Error('EXECUTION_IDEMPOTENCY_CONFLICT');
    if (rows[0]?.status !== 'RUNNING') throw new Error('EXECUTION_ALREADY_TERMINAL');
  }

  async complete(summary: RunSummaryRecord): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const updateResult = (await manager.query(
        `UPDATE research_execution SET status = $2, finished_at = $3, duration_ms = $4,
         policy_snapshot = $5::jsonb, counts = $6::jsonb, category_coverage = $7::jsonb, failure_code = NULL
         WHERE execution_key = $1 AND status = 'RUNNING' RETURNING execution_key`,
        [
          summary.executionKey,
          summary.status,
          summary.finishedAt,
          summary.durationMs,
          JSON.stringify(summary.policySnapshot ?? {}),
          JSON.stringify(summary.counts),
          JSON.stringify({ categories: summary.categories, ...summary.categoryCoverage }),
        ],
      )) as [unknown[], number];
      if (updateResult[1] !== 1) throw new Error('EXECUTION_NOT_RUNNING');

      for (const category of summary.categories) {
        await manager.query(
          `INSERT INTO category_processing_result (execution_key, category_id, status, reference_count, failure_code)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            summary.executionKey,
            category.categoryId,
            category.status,
            category.referenceCount,
            category.failureCode ?? null,
          ],
        );
      }
      for (const reference of summary.rankingReferences ?? []) {
        await manager.query(
          `INSERT INTO category_candidate_reference
           (execution_key, category_id, effective_position, reported_position, reference_type, source_id, assessment_key, rejection_code, observed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            summary.executionKey,
            reference.categoryId,
            reference.effectivePosition,
            reference.reportedPosition ?? null,
            reference.referenceType,
            reference.sourceId,
            reference.assessmentKey ?? null,
            reference.rejectionCode ?? null,
            reference.observedAt,
          ],
        );
      }
      for (const assessment of summary.assessments ?? []) {
        await manager.query(
          `INSERT INTO evaluated_offer (execution_key, product_id, variation_key, canonical_key, outcome, reason_codes, offer_snapshot)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
          [
            summary.executionKey,
            assessment.productId,
            assessment.variationKey,
            assessment.canonicalKey,
            assessment.outcome,
            JSON.stringify(assessment.reasonCodes),
            JSON.stringify(assessment.snapshot),
          ],
        );
      }
      if (summary.selectedProduct) {
        const selected = summary.selectedProduct as { productId?: unknown; variationKey?: unknown };
        if (typeof selected.productId !== 'string') throw new Error('SELECTED_PRODUCT_ID_MISSING');
        const variationKey =
          typeof selected.variationKey === 'string' && selected.variationKey
            ? selected.variationKey
            : 'NO_VARIATION';
        await manager.query(
          `INSERT INTO selected_product (execution_key, canonical_key, product_snapshot)
           VALUES ($1, $2, $3::jsonb)`,
          [
            summary.executionKey,
            `${selected.productId}:${variationKey}`,
            JSON.stringify(summary.selectedProduct),
          ],
        );
      }
    });
  }

  async fail(executionKey: string, failureCode: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE research_execution SET status = 'FAILED', failure_code = $2, finished_at = now()
       WHERE execution_key = $1 AND status = 'RUNNING'`,
      [executionKey, failureCode],
    );
  }

  async markInterrupted(): Promise<void> {
    await this.dataSource.query(
      `UPDATE research_execution SET status = 'INTERRUPTED', finished_at = now(),
       failure_code = 'PROCESS_RESTARTED' WHERE status = 'RUNNING'`,
    );
  }

  async purgeExpired(cutoff: Date): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const result = (await manager.query(
        `DELETE FROM research_execution WHERE status <> 'RUNNING' AND finished_at <= $1`,
        [cutoff],
      )) as [unknown[], number];
      return result[1];
    });
  }
}
