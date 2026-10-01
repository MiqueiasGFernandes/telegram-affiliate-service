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
  RunSummaryRecord,
} from '../../../src/modules/affiliate-research/application/ports/out/research-ports.js';
import type {
  AffiliateEvidence,
  NormalizedOffer,
} from '../../../src/modules/affiliate-research/domain/entities/offer.js';
import { readFileSync } from 'node:fs';
import type { AnySchema } from 'ajv';
import { validateJsonSchema } from '../../../src/platform/contract/json-schema-validator.js';

const selectedSchema = JSON.parse(
  readFileSync(
    new URL(
      '../../../specs/001-qualify-affiliate-products/contracts/selected-product.schema.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as AnySchema;
const summarySchema = JSON.parse(
  readFileSync(
    new URL(
      '../../../specs/001-qualify-affiliate-products/contracts/run-summary.schema.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as AnySchema;

const now = new Date('2026-10-01T10:00:00Z');
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

function offer(
  id: string,
  originalPrice: string,
  discountedPrice: string,
  available = true,
): NormalizedOffer {
  return {
    productId: id,
    variationKey: 'NO_VARIATION',
    itemId: id,
    title: `Product ${id}`,
    condition: 'new',
    available,
    currency: 'BRL',
    originalPrice,
    discountedPrice,
    imageUrl: `https://img.example/${id}.jpg`,
    permalink: `https://produto.mercadolivre.com.br/${id}`,
  };
}

describe('category leader promotion and tournament', () => {
  it('revalidates the promoted same-category candidate before recalculating the cross-category winner', async () => {
    const references: Record<string, readonly RankedReference[]> = {
      MLB1: [
        {
          categoryId: 'MLB1',
          effectivePosition: 1,
          type: 'ITEM',
          sourceId: 'bad',
          observedAt: now,
        },
        {
          categoryId: 'MLB1',
          effectivePosition: 2,
          type: 'ITEM',
          sourceId: 'next',
          observedAt: now,
        },
      ],
      MLB2: [
        {
          categoryId: 'MLB2',
          effectivePosition: 1,
          type: 'ITEM',
          sourceId: 'other',
          observedAt: now,
        },
      ],
    };
    const snapshots = new Map([
      ['bad', offer('bad', '100', '40')],
      ['next', offer('next', '100', '80')],
      ['other', offer('other', '100', '70')],
    ]);
    const evidence = new Map<string, AffiliateEvidence>(
      [...snapshots.keys()].map((id) => [
        id,
        {
          productId: id,
          variationKey: 'NO_VARIATION',
          eligible: true,
          affiliateUrl: `https://meli.la/${id}`,
          commissionPercent: '10',
          expectedCommissionAmount: id === 'bad' ? '4' : id === 'next' ? '8' : '7',
          currency: 'BRL',
          capturedAt: new Date(now.getTime() - 60_000),
          fingerprint: 'a'.repeat(64),
        },
      ]),
    );
    const calls: string[] = [];
    const gateway: MercadoLivreGatewayPort = {
      validateLeafCategories: async () => undefined,
      getBestSellerRanking: async (categoryId) => ({
        kind: 'RANKING_AVAILABLE',
        references: references[categoryId]!,
        observedAt: now,
      }),
      resolveRankedReferences: async (reference) => ({
        kind: 'RESOLVED',
        offer: snapshots.get(reference.sourceId)!,
      }),
      getCurrentOffer: async (itemId) => {
        calls.push(itemId);
        return itemId === 'bad' ? offer('bad', '100', '40', false) : snapshots.get(itemId)!;
      },
      validateAffiliateDestination: async () => true,
    };
    const evidenceReader: AffiliateEvidenceReaderPort = {
      find: async (productId) => evidence.get(productId),
    };
    let completed: RunSummaryRecord | undefined;
    const store: ResearchExecutionStorePort = {
      begin: async () => undefined,
      complete: async (s) => {
        completed = s;
      },
      fail: async () => undefined,
      markInterrupted: async () => undefined,
      purgeExpired: async () => 0,
    };
    const clock: ClockPort = { now: () => now };
    const logger: LoggerPort = { info: () => undefined, error: () => undefined };

    const result = await new RunAffiliateResearchUseCase(
      config,
      gateway,
      evidenceReader,
      store,
      clock,
      logger,
    ).execute({ scheduledFor: now, mode: 'ONCE' });
    expect(calls).toEqual(['bad', 'next', 'other']);
    expect(result.summary.status).toBe('COMPLETED_WITH_SELECTION');
    expect(result.selectedProduct).toMatchObject({
      productId: 'other',
      categoryId: 'MLB2',
      categoryPosition: 1,
      discountedPrice: '70',
    });
    expect(validateJsonSchema(selectedSchema, result.selectedProduct)).toEqual([]);
    expect(validateJsonSchema(summarySchema, result.summary)).toEqual([]);
    expect(completed?.counts).toMatchObject({
      examined: 3,
      qualified: 2,
      rejected: 1,
      selected: 1,
    });
  });
});
