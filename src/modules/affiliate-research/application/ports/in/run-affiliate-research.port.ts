export const RUN_AFFILIATE_RESEARCH = Symbol('RUN_AFFILIATE_RESEARCH');

export interface RunAffiliateResearchInput {
  readonly scheduledFor: Date;
  readonly mode: 'SCHEDULED' | 'ONCE';
}

export interface RunSummary {
  readonly schemaVersion: 1;
  readonly event: 'affiliate_research.completed';
  readonly runId: string;
  readonly executionKey: string;
  readonly mode: 'SCHEDULED' | 'ONCE';
  readonly status: string;
  readonly scheduledFor: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly counts: { examined: number; qualified: number; rejected: number; selected: 0 | 1 };
  readonly rejections: readonly {
    readonly reasonCode: string;
    readonly canonicalKey?: string;
    readonly referenceType?: 'ITEM' | 'PRODUCT' | 'USER_PRODUCT';
    readonly sourceId?: string;
  }[];
  readonly categoryCoverage: {
    configured: number;
    processedWithRanking: number;
    processedWithoutRanking: number;
    unavailable: number;
    categories: readonly {
      categoryId: string;
      status: string;
      referenceCount: number;
      failureCode?: string;
    }[];
  };
  readonly selectedProductId: string | null;
  readonly persistence: 'SAVED' | 'DISABLED' | 'FAILED';
  readonly failure?: { code: string; message: string };
}

export interface RunAffiliateResearchPort {
  execute(input: RunAffiliateResearchInput): Promise<RunAffiliateResearchResult>;
}

export interface RunAffiliateResearchResult {
  readonly summary: RunSummary;
  readonly selectedProduct?: Record<string, unknown>;
}
