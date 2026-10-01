import { Module } from '@nestjs/common';
import { APP_CONFIG } from '../../platform/config/config-token.js';
import {
  APP_LOGGER,
  AFFILIATE_EVIDENCE_READER,
  CLOCK,
  MERCADO_LIVRE_GATEWAY,
  RESEARCH_EXECUTION_STORE,
} from './application/ports/out/research-ports.js';
import { RUN_AFFILIATE_RESEARCH } from './application/ports/in/run-affiliate-research.port.js';
import { RunAffiliateResearchUseCase } from './application/use-cases/run-affiliate-research.use-case.js';
import { ManualAffiliateEvidenceReader } from './infrastructure/affiliate-evidence/manual-affiliate-evidence.reader.js';
import { MercadoLivreApiClient } from './infrastructure/mercado-livre/mercado-livre-api.client.js';
import { NoopResearchExecutionStore } from './infrastructure/persistence/noop/noop-research-execution.store.js';
import { SystemClock } from '../../platform/observability/system-clock.js';
import { StructuredLogger } from '../../platform/observability/structured-logger.js';
import { AffiliateResearchJob } from './infrastructure/scheduler/affiliate-research.job.js';
import { RetentionMaintenanceJob } from './infrastructure/scheduler/retention-maintenance.job.js';

const providers = [
  {
    provide: MERCADO_LIVRE_GATEWAY,
    inject: [APP_CONFIG],
    useFactory: (config: ConstructorParameters<typeof MercadoLivreApiClient>[0]) =>
      new MercadoLivreApiClient(config),
  },
  {
    provide: AFFILIATE_EVIDENCE_READER,
    inject: [APP_CONFIG],
    useFactory: (config: ConstructorParameters<typeof ManualAffiliateEvidenceReader>[0]) =>
      new ManualAffiliateEvidenceReader(config),
  },
  {
    provide: RESEARCH_EXECUTION_STORE,
    inject: [APP_CONFIG],
    useFactory: async (config: {
      persistenceEnabled: boolean;
      databaseUrl?: string;
      databaseSsl: boolean;
      databasePoolMax: number;
    }) => {
      if (!config.persistenceEnabled) return new NoopResearchExecutionStore();
      if (!config.databaseUrl)
        throw new Error('DATABASE_URL is required when persistence is enabled');
      const [{ DataSource }, { PostgresResearchExecutionStore }] = await Promise.all([
        import('typeorm'),
        import('./infrastructure/persistence/postgres/research-execution.store.js'),
      ]);
      const dataSource = new DataSource({
        type: 'postgres',
        url: config.databaseUrl,
        ssl: config.databaseSsl ? { rejectUnauthorized: true } : false,
        poolSize: config.databasePoolMax,
        synchronize: false,
        migrationsRun: false,
      });
      await dataSource.initialize();
      const store = new PostgresResearchExecutionStore(dataSource);
      await store.markInterrupted();
      await store.purgeExpired(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
      return store;
    },
  },
  {
    provide: AffiliateResearchJob,
    inject: [APP_CONFIG, RUN_AFFILIATE_RESEARCH],
    useFactory: (
      config: ConstructorParameters<typeof AffiliateResearchJob>[0],
      research: ConstructorParameters<typeof AffiliateResearchJob>[1],
    ) => new AffiliateResearchJob(config, research),
  },
  {
    provide: RetentionMaintenanceJob,
    inject: [APP_CONFIG, RESEARCH_EXECUTION_STORE],
    useFactory: (
      config: ConstructorParameters<typeof RetentionMaintenanceJob>[0],
      store: ConstructorParameters<typeof RetentionMaintenanceJob>[1],
    ) => new RetentionMaintenanceJob(config, store),
  },
  { provide: CLOCK, useClass: SystemClock },
  { provide: APP_LOGGER, useClass: StructuredLogger },
  {
    provide: RUN_AFFILIATE_RESEARCH,
    inject: [
      APP_CONFIG,
      MERCADO_LIVRE_GATEWAY,
      AFFILIATE_EVIDENCE_READER,
      RESEARCH_EXECUTION_STORE,
      CLOCK,
      APP_LOGGER,
    ],
    useFactory: (...dependencies: ConstructorParameters<typeof RunAffiliateResearchUseCase>) =>
      new RunAffiliateResearchUseCase(...dependencies),
  },
];

@Module({ providers, exports: [RUN_AFFILIATE_RESEARCH, AffiliateResearchJob] })
export class AffiliateResearchModule {}
