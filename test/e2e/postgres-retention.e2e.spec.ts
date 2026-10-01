import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { InitialSchema20261001000000 } from '../../src/modules/affiliate-research/infrastructure/persistence/postgres/initial-schema.migration.js';
import { RetentionSchema20261001010000 } from '../../src/modules/affiliate-research/infrastructure/persistence/postgres/retention-schema.migration.js';
import { PostgresResearchExecutionStore } from '../../src/modules/affiliate-research/infrastructure/persistence/postgres/research-execution.store.js';

const url = process.env['DATABASE_URL'];
describe.skipIf(!url)('PostgreSQL retention E2E (Docker Compose)', () => {
  const source = new DataSource({
    type: 'postgres',
    ...(url ? { url } : {}),
    synchronize: false,
    migrationsRun: false,
    migrations: [InitialSchema20261001000000, RetentionSchema20261001010000],
  });
  let store: PostgresResearchExecutionStore;
  beforeAll(async () => {
    await source.initialize();
    await source.runMigrations();
    store = new PostgresResearchExecutionStore(source);
  });
  afterAll(async () => {
    if (source.isInitialized) await source.destroy();
  });

  it('deletes expired terminal runs with all child rows, preserving recent and RUNNING records', async () => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 90 * 86400000);
    const expired = cutoff;
    await source.query(
      `INSERT INTO research_execution (execution_key,run_id,status,started_at,finished_at) VALUES
      ('old','00000000-0000-0000-0000-000000000001','COMPLETED_NO_SELECTION',$1,$1),
      ('recent','00000000-0000-0000-0000-000000000002','FAILED',$2,$2),
      ('running','00000000-0000-0000-0000-000000000003','RUNNING',$1,NULL)`,
      [expired, now],
    );
    await source.query(
      `INSERT INTO category_processing_result (execution_key,category_id,status,reference_count) VALUES ('old','MLB1','PROCESSED_NO_RANKING',0)`,
    );
    await source.query(
      `INSERT INTO category_candidate_reference (execution_key,category_id,effective_position,reference_type,source_id,observed_at) VALUES ('old','MLB1',1,'ITEM','ITEM1',$1)`,
      [expired],
    );
    await source.query(
      `INSERT INTO evaluated_offer (execution_key,product_id,variation_key,canonical_key,outcome,reason_codes,offer_snapshot) VALUES ('old','MLB1','NO_VARIATION','MLB1:NO_VARIATION','REJECTED','[]','{}')`,
    );
    await source.query(
      `INSERT INTO selected_product (execution_key,canonical_key,product_snapshot) VALUES ('old','MLB1:NO_VARIATION','{}')`,
    );
    expect(await store.purgeExpired(cutoff)).toBe(1);
    expect(
      await source.query(`SELECT execution_key FROM research_execution ORDER BY execution_key`),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ execution_key: 'recent' }),
        expect.objectContaining({ execution_key: 'running' }),
      ]),
    );
    for (const table of [
      'category_processing_result',
      'category_candidate_reference',
      'evaluated_offer',
      'selected_product',
    ]) {
      expect(await source.query(`SELECT 1 FROM ${table} WHERE execution_key = 'old'`)).toHaveLength(
        0,
      );
    }
  });
});
