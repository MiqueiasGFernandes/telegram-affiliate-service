import { Module } from '@nestjs/common';
import { AffiliateResearchModule } from './modules/affiliate-research/affiliate-research.module.js';
import { PlatformConfigModule } from './platform/config/platform-config.module.js';

@Module({
  imports: [PlatformConfigModule, AffiliateResearchModule],
})
export class AppModule {}
