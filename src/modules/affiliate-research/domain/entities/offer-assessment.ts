import type { CategoryCandidateReference } from './category-candidate-reference.js';
import type { AffiliateEvidence, NormalizedOffer } from './offer.js';
import type { QualificationResult } from '../services/offer-qualification.js';

export class OfferAssessment {
  readonly canonicalKey: string;
  private readonly memberships = new Map<string, CategoryCandidateReference>();
  private currentResult?: QualificationResult;

  constructor(readonly offer: NormalizedOffer) {
    this.canonicalKey = `${offer.productId}:${offer.variationKey || 'NO_VARIATION'}`;
  }

  addMembership(reference: CategoryCandidateReference): void {
    const key = `${reference.categoryId}:${reference.effectivePosition}`;
    if (this.memberships.has(key)) throw new Error('Duplicate ranking position in category');
    this.memberships.set(key, reference);
  }

  get categoryReferences(): readonly CategoryCandidateReference[] {
    return [...this.memberships.values()].sort(
      (a, b) =>
        a.categoryId.localeCompare(b.categoryId) || a.effectivePosition - b.effectivePosition,
    );
  }

  decide(result: QualificationResult, _evidence?: AffiliateEvidence): void {
    this.currentResult = result;
  }

  get outcome(): QualificationResult | undefined {
    return this.currentResult;
  }
}

export function deduplicateAssessments(
  offers: readonly NormalizedOffer[],
): Map<string, OfferAssessment> {
  const assessments = new Map<string, OfferAssessment>();
  for (const offer of offers) {
    const key = `${offer.productId}:${offer.variationKey || 'NO_VARIATION'}`;
    if (!assessments.has(key)) assessments.set(key, new OfferAssessment(offer));
  }
  return assessments;
}
