import { Global, Module } from '@nestjs/common';
import { APP_CONFIG } from './config-token.js';
import { parseEnvironment } from './environment-config.js';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => parseEnvironment(process.env) }],
  exports: [APP_CONFIG],
})
export class PlatformConfigModule {}
