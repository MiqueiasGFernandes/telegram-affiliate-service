export const MERCADO_LIVRE_GATEWAY = Symbol('MERCADO_LIVRE_GATEWAY');
export const AFFILIATE_EVIDENCE_READER = Symbol('AFFILIATE_EVIDENCE_READER');
export const RESEARCH_EXECUTION_STORE = Symbol('RESEARCH_EXECUTION_STORE');
export const CLOCK = Symbol('CLOCK');
export const APP_LOGGER = Symbol('APP_LOGGER');
import type { AffiliateEvidence, NormalizedOffer } from '../../../domain/entities/offer.js';

export type RankingResult =
  | {
      readonly kind: 'RANKING_AVAILABLE';
      readonly references: readonly RankedReference[];
      readonly observedAt: Date;
    }
  | { readonly kind: 'NO_RANKING'; readonly observedAt: Date }
  | { readonly kind: 'UNAVAILABLE'; readonly failureCode: string; readonly observedAt: Date };

export interface RankedReference {
  readonly categoryId: string;
  readonly effectivePosition: number;
  readonly reportedPosition?: number;
  readonly type: 'ITEM' | 'PRODUCT' | 'USER_PRODUCT';
  readonly sourceId: string;
  readonly observedAt: Date;
}

export interface MercadoLivreGatewayPort {
  discoverLeafCategories(limit: number): Promise<readonly DiscoveredLeafCategory[]>;
  validateLeafCategories(categoryIds: readonly string[]): Promise<void>;
  getBestSellerRanking(categoryId: string): Promise<RankingResult>;
  resolveRankedReferences(reference: RankedReference): Promise<ReferenceResolution>;
  getCurrentOffer(itemId: string): Promise<NormalizedOffer>;
  validateAffiliateDestination(
    affiliateUrl: string,
    productId: string,
    itemId: string,
  ): Promise<boolean>;
}

export interface DiscoveredLeafCategory {
  readonly categoryId: string;
  readonly itemCount: number;
}

export type ReferenceResolution =
  | { readonly kind: 'RESOLVED'; readonly offer: NormalizedOffer }
  | { readonly kind: 'REJECTED'; readonly reason: string }
  | { readonly kind: 'UNAVAILABLE'; readonly failureCode: string };

export interface AffiliateEvidenceReaderPort {
  find(productId: string, variationKey: string): Promise<AffiliateEvidence | undefined>;
}

export interface ResearchExecutionStorePort {
  begin(input: { executionKey: string; runId: string; startedAt: Date }): Promise<void>;
  complete(summary: RunSummaryRecord): Promise<void>;
  fail(executionKey: string, failureCode: string): Promise<void>;
  markInterrupted(): Promise<void>;
  purgeExpired(cutoff: Date): Promise<number>;
}

export interface RunSummaryRecord {
  readonly executionKey: string;
  readonly runId: string;
  readonly mode: 'SCHEDULED' | 'ONCE';
  readonly scheduledFor: Date;
  readonly status: string;
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly durationMs: number;
  readonly counts: { examined: number; qualified: number; rejected: number; selected: 0 | 1 };
  readonly categories: readonly {
    categoryId: string;
    status: string;
    referenceCount: number;
    failureCode?: string;
  }[];
  readonly categoryCoverage: {
    configured: number;
    processedWithRanking: number;
    processedWithoutRanking: number;
    unavailable: number;
  };
  readonly selectedProduct?: unknown;
  readonly policySnapshot?: Readonly<Record<string, unknown>>;
  readonly rankingReferences?: readonly {
    categoryId: string;
    effectivePosition: number;
    reportedPosition?: number;
    referenceType: 'ITEM' | 'PRODUCT' | 'USER_PRODUCT';
    sourceId: string;
    assessmentKey?: string;
    rejectionCode?: string;
    observedAt: Date;
  }[];
  readonly assessments?: readonly {
    readonly canonicalKey: string;
    readonly productId: string;
    readonly variationKey: string;
    readonly outcome: 'QUALIFIED' | 'REJECTED';
    readonly reasonCodes: readonly string[];
    readonly snapshot: Readonly<Record<string, unknown>>;
  }[];
}

export interface ClockPort {
  now(): Date;
}
export interface LoggerPort {
  info(event: string, fields: Record<string, unknown>): void;
  error(event: string, fields: Record<string, unknown>): void;
}
