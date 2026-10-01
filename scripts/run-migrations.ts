import dataSource from '../src/modules/affiliate-research/infrastructure/persistence/postgres/data-source.js';

try {
  await dataSource.initialize();
  const pending = await dataSource.showMigrations();
  if (process.argv[2] !== 'status') {
    await dataSource.runMigrations({ transaction: 'all' });
    if (await dataSource.showMigrations()) throw new Error('MIGRATIONS_PENDING');
  }
  process.stdout.write(`${JSON.stringify({ event: 'affiliate_research.migrations', pending })}\n`);
} finally {
  if (dataSource.isInitialized) await dataSource.destroy();
}
