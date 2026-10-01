import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { parseEnvironment } from './platform/config/environment-config.js';
import { AffiliateResearchJob } from './modules/affiliate-research/infrastructure/scheduler/affiliate-research.job.js';

export async function bootstrap(): Promise<void> {
  parseEnvironment(process.env);
  const config = parseEnvironment(process.env);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  if (config.executionMode === 'once') {
    try {
      await app.get(AffiliateResearchJob).runOnce();
    } finally {
      await app.close();
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrap().catch(() => {
    process.stderr.write(
      `${JSON.stringify({ event: 'affiliate_research.bootstrap_failed', code: 'BOOTSTRAP_FAILED' })}\n`,
    );
    process.exitCode = 1;
  });
}
