import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { InitialSchema20261001000000 } from '../../src/modules/affiliate-research/infrastructure/persistence/postgres/initial-schema.migration.js';
import { PostgresResearchExecutionStore } from '../../src/modules/affiliate-research/infrastructure/persistence/postgres/research-execution.store.js';

describe.skipIf(!process.env['DATABASE_URL'])('PostgreSQL persistence E2E', () => {
  it('persists one completed run and its selected product transactionally', async () => {
    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) throw new Error('DATABASE_URL is required by the E2E suite');
    const source = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      synchronize: false,
      migrations: [InitialSchema20261001000000],
    });
    await source.initialize();
    try {
      await source.runMigrations();
      const store = new PostgresResearchExecutionStore(source);
      const startedAt = new Date();
      await store.begin({
        executionKey: 'e2e:one',
        runId: '2c2e9a87-1a21-4ca7-ae40-25d42a776a9a',
        startedAt,
      });
      await store.begin({
        executionKey: 'e2e:one',
        runId: '2c2e9a87-1a21-4ca7-ae40-25d42a776a9a',
        startedAt,
      });
      await store.complete({
        executionKey: 'e2e:one',
        runId: '2c2e9a87-1a21-4ca7-ae40-25d42a776a9a',
        mode: 'ONCE',
        scheduledFor: startedAt,
        status: 'COMPLETED_WITH_SELECTION',
        startedAt,
        finishedAt: new Date(),
        durationMs: 1,
        counts: { examined: 1, qualified: 1, rejected: 0, selected: 1 },
        categories: [{ categoryId: 'MLB1', status: 'PROCESSED_WITH_RANKING', referenceCount: 1 }],
        categoryCoverage: {
          configured: 1,
          processedWithRanking: 1,
          processedWithoutRanking: 0,
          unavailable: 0,
        },
        policySnapshot: { fingerprint: 'fixture-policy' },
        rankingReferences: [
          {
            categoryId: 'MLB1',
            effectivePosition: 1,
            referenceType: 'ITEM',
            sourceId: 'MLB123',
            assessmentKey: 'MLB123:NO_VARIATION',
            observedAt: startedAt,
          },
        ],
        assessments: [
          {
            canonicalKey: 'MLB123:NO_VARIATION',
            productId: 'MLB123',
            variationKey: 'NO_VARIATION',
            outcome: 'QUALIFIED',
            reasonCodes: [],
            snapshot: { productId: 'MLB123' },
          },
        ],
        selectedProduct: { productId: 'MLB123' },
      });
      const executions = await source.query(
        'SELECT status FROM research_execution WHERE execution_key = $1',
        ['e2e:one'],
      );
      const selected = await source.query(
        'SELECT product_snapshot FROM selected_product WHERE execution_key = $1',
        ['e2e:one'],
      );
      expect(executions[0]?.status).toBe('COMPLETED_WITH_SELECTION');
      expect(selected[0]?.product_snapshot).toEqual({ productId: 'MLB123' });
      const auditRows = await source.query(
        `SELECT (SELECT count(*) FROM category_processing_result WHERE execution_key = $1) AS categories,
                (SELECT count(*) FROM category_candidate_reference WHERE execution_key = $1) AS references,
                (SELECT count(*) FROM evaluated_offer WHERE execution_key = $1) AS assessments`,
        ['e2e:one'],
      );
      expect(auditRows[0]).toMatchObject({ categories: '1', references: '1', assessments: '1' });
      await expect(
        source.query(
          'INSERT INTO selected_product (execution_key, canonical_key, product_snapshot) VALUES ($1, $2, $3::jsonb)',
          ['e2e:one', 'MLB123:NO_VARIATION', '{}'],
        ),
      ).rejects.toThrow();
      await source.query(
        'INSERT INTO research_execution (execution_key, run_id, status, started_at) VALUES ($1, $2, $3, $4)',
        ['e2e:interrupted', '7d99c27d-4d2f-4808-bf18-1b2c18a8e6b8', 'RUNNING', startedAt],
      );
      await store.markInterrupted();
      const interrupted = await source.query(
        'SELECT status, failure_code FROM research_execution WHERE execution_key = $1',
        ['e2e:interrupted'],
      );
      expect(interrupted[0]).toMatchObject({
        status: 'INTERRUPTED',
        failure_code: 'PROCESS_RESTARTED',
      });
      await store.begin({
        executionKey: 'e2e:rollback',
        runId: 'dea0ab93-dcdb-4e02-ab73-24f07047126c',
        startedAt,
      });
      await expect(
        store.complete({
          executionKey: 'e2e:rollback',
          runId: 'dea0ab93-dcdb-4e02-ab73-24f07047126c',
          mode: 'ONCE',
          scheduledFor: startedAt,
          status: 'COMPLETED_NO_SELECTION',
          startedAt,
          finishedAt: new Date(),
          durationMs: 1,
          counts: { examined: 0, qualified: 0, rejected: 0, selected: 0 },
          categories: [{ categoryId: 'MLB2', status: 'PROCESSED_WITH_RANKING', referenceCount: 1 }],
          categoryCoverage: {
            configured: 1,
            processedWithRanking: 1,
            processedWithoutRanking: 0,
            unavailable: 0,
          },
          rankingReferences: [
            {
              categoryId: 'MLB2',
              effectivePosition: 21,
              referenceType: 'ITEM',
              sourceId: 'MLB999',
              observedAt: startedAt,
            },
          ],
        }),
      ).rejects.toThrow();
      const rolledBack = await source.query(
        'SELECT status FROM research_execution WHERE execution_key = $1',
        ['e2e:rollback'],
      );
      expect(rolledBack[0]?.status).toBe('RUNNING');
    } finally {
      await source.destroy();
    }
  }, 30_000);
});
