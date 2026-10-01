import { compareDecimal } from '../value-objects/decimal.js';
import type { QualifiedOffer } from './offer-qualification.js';

export interface SelectionCandidate {
  readonly categoryId: string;
  readonly position: number;
  readonly assessmentKey: string;
  readonly observedAt: Date;
  readonly qualified: QualifiedOffer;
}

export function leadersByCategory(candidates: readonly SelectionCandidate[]): SelectionCandidate[] {
  const leaders = new Map<string, SelectionCandidate>();
  for (const candidate of candidates) {
    if (!Number.isInteger(candidate.position) || candidate.position < 1 || candidate.position > 20)
      throw new Error('Candidate position must be from 1 to 20');
    const current = leaders.get(candidate.categoryId);
    if (
      !current ||
      candidate.position < current.position ||
      (candidate.position === current.position && candidate.assessmentKey < current.assessmentKey)
    )
      leaders.set(candidate.categoryId, candidate);
  }
  return [...leaders.values()].sort((a, b) => a.categoryId.localeCompare(b.categoryId));
}

export function compareLeaders(left: SelectionCandidate, right: SelectionCandidate): number {
  const discountOrder = compareDecimal(
    right.qualified.discountPercent,
    left.qualified.discountPercent,
    4,
  );
  if (discountOrder !== 0) return discountOrder;
  const commissionOrder = compareDecimal(
    right.qualified.expectedCommissionAmount,
    left.qualified.expectedCommissionAmount,
    2,
  );
  if (commissionOrder !== 0) return commissionOrder;
  const categoryOrder = left.categoryId.localeCompare(right.categoryId);
  if (categoryOrder !== 0) return categoryOrder;
  return left.assessmentKey.localeCompare(right.assessmentKey);
}
