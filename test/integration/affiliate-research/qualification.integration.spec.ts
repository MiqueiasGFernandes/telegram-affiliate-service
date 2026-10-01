import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../../src/platform/config/environment-config.js';
import { RunAffiliateResearchUseCase } from '../../../src/modules/affiliate-research/application/use-cases/run-affiliate-research.use-case.js';
import type {
  AffiliateEvidenceReaderPort,
  ClockPort,
  LoggerPort,
  MercadoLivreGatewayPort,
  RankedReference,
  ResearchExecutionStorePort,
} from '../../../src/modules/affiliate-research/application/ports/out/research-ports.js';

const config = parseEnvironment({
  NODE_ENV: 'test',
  SCHEDULE_CRON: '0 * * * *',
  SCHEDULE_TIMEZONE: 'America/Sao_Paulo',
  LOW_TICKET_MIN: '10',
  LOW_TICKET_MAX: '99.99',
  MEDIUM_TICKET_MIN: '100',
  MEDIUM_TICKET_MAX: '500',
  MIN_DISCOUNT_PERCENT: '10',
  MELI_CATEGORY_IDS: 'MLB1,MLB2',
  MELI_CLIENT_ID: 'id',
  MELI_CLIENT_SECRET: 'secret',
  MELI_REFRESH_TOKEN: 'refresh',
  AFFILIATE_EVIDENCE_FILE: '/tmp/evidence.json',
});
const now = new Date('2026-10-01T10:00:00.000Z');

describe('affiliate research qualification flow', () => {
  it('completes an official no-ranking category and marks technical failures incomplete', async () => {
    const ref: RankedReference = {
      categoryId: 'MLB1',
      effectivePosition: 1,
      type: 'ITEM',
      sourceId: 'MLB-1',
      observedAt: now,
    };
    const gateway: MercadoLivreGatewayPort = {
      validateLeafCategories: async () => undefined,
      getBestSellerRanking: async (id) =>
        id === 'MLB1'
          ? { kind: 'RANKING_AVAILABLE', references: [ref], observedAt: now }
          : { kind: 'NO_RANKING', observedAt: now },
      resolveRankedReferences: async () => ({ kind: 'REJECTED', reason: 'not-used' }),
      getCurrentOffer: async () => {
        throw new Error('not used');
      },
      validateAffiliateDestination: async () => true,
    };
    const evidence: AffiliateEvidenceReaderPort = { find: async () => undefined };
    const completed: string[] = [];
    const store: ResearchExecutionStorePort = {
      begin: async () => undefined,
      complete: async (s) => {
        completed.push(s.status);
      },
      fail: async () => undefined,
      markInterrupted: async () => undefined,
      purgeExpired: async () => 0,
    };
    const clock: ClockPort = { now: () => now };
    const logger: LoggerPort = { info: () => undefined, error: () => undefined };
    const useCase = new RunAffiliateResearchUseCase(
      config,
      gateway,
      evidence,
      store,
      clock,
      logger,
    );
    const result = await useCase.execute({ scheduledFor: now, mode: 'ONCE' });
    expect(result.summary.status).toBe('COMPLETED_NO_SELECTION');
    expect(result.summary.categoryCoverage).toMatchObject({
      configured: 2,
      processedWithRanking: 1,
      processedWithoutRanking: 1,
      unavailable: 0,
    });

    const brokenGateway: MercadoLivreGatewayPort = {
      ...gateway,
      getBestSellerRanking: async (id) =>
        id === 'MLB1'
          ? { kind: 'UNAVAILABLE', failureCode: 'TIMEOUT', observedAt: now }
          : { kind: 'NO_RANKING', observedAt: now },
    };
    const failedUseCase = new RunAffiliateResearchUseCase(
      config,
      brokenGateway,
      evidence,
      store,
      clock,
      logger,
    );
    expect(
      (await failedUseCase.execute({ scheduledFor: new Date(now.getTime() + 1), mode: 'ONCE' }))
        .summary.status,
    ).toBe('INCOMPLETE');
    expect(completed).toEqual(['COMPLETED_NO_SELECTION', 'INCOMPLETE']);
  });
});
