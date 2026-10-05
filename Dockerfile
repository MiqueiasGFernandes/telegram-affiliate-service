import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { parseEnvironment } from './platform/config/environment-config.js';
import { AffiliateResearchJob } from './modules/affiliate-research/infrastructure/scheduler/affiliate-research.job.js';
import { errorDetails } from './modules/affiliate-research/application/errors/error-details.js';
import { PublicHttpServer } from './platform/http/public-http-server.js';

export async function bootstrap(): Promise<void> {
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
    return;
  }
  const httpServer = app.get(PublicHttpServer);
  try {
    await httpServer.listen(config.httpPort);
  } catch (error) {
    await app.close();
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrap().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        event: 'affiliate_research.bootstrap_failed',
        code: 'BOOTSTRAP_FAILED',
        ...errorDetails(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
