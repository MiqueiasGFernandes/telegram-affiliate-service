export interface NormalizedOffer {
  readonly productId: string;
  readonly variationKey: string;
  readonly itemId: string;
  readonly title: string;
  readonly condition: string;
  readonly available: boolean;
  readonly currency: string;
  readonly originalPrice: string;
  readonly discountedPrice: string;
  readonly imageUrl: string;
  readonly permalink: string;
  readonly userProductId?: string;
}

export interface AffiliateEvidence {
  readonly productId: string;
  readonly variationKey: string;
  readonly eligible: true;
  readonly affiliateUrl: string;
  readonly commissionPercent: string;
  readonly expectedCommissionAmount?: string;
  readonly currency: string;
  readonly capturedAt: Date;
  readonly validUntil?: Date;
  readonly fingerprint: string;
}
