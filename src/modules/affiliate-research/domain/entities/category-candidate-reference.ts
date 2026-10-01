export type RankingReferenceType = 'ITEM' | 'PRODUCT' | 'USER_PRODUCT';

export interface CategoryCandidateReference {
  readonly categoryId: string;
  readonly effectivePosition: number;
  readonly reportedPosition?: number;
  readonly referenceType: RankingReferenceType;
  readonly sourceId: string;
  readonly assessmentKey?: string;
  readonly observedAt: Date;
}

export type CategoryStatus = 'PROCESSED_WITH_RANKING' | 'PROCESSED_NO_RANKING' | 'UNAVAILABLE';
export interface CategoryProcessingResult {
  readonly categoryId: string;
  readonly status: CategoryStatus;
  readonly referenceCount: number;
  readonly observedAt: Date | null;
  readonly failureCode?: string;
}
