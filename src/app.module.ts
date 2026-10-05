import { Module } from '@nestjs/common';
import { AffiliateResearchModule } from './modules/affiliate-research/affiliate-research.module.js';
import { PlatformConfigModule } from './platform/config/platform-config.module.js';
import { PublicHttpServer } from './platform/public-http-server.js';

@Module({
  imports: [PlatformConfigModule, AffiliateResearchModule],
  providers: [PublicHttpServer],
})
export class AppModule {}
