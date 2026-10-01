import {
  commissionAmount,
  compareDecimal,
  decimalToUnits,
  discountPercent,
  formatUnits,
} from '../value-objects/decimal.js';
import type { AffiliateEvidence, NormalizedOffer } from '../entities/offer.js';
import type { QualificationPolicy } from '../policies/qualification-policy.js';

export interface QualifiedOffer {
  readonly offer: NormalizedOffer;
  readonly affiliate: AffiliateEvidence;
  readonly discountAmount: string;
  readonly discountPercent: string;
  readonly expectedCommissionAmount: string;
  readonly commissionPercent: string;
  readonly ticketBand: 'LOW' | 'MEDIUM';
  readonly capturedAt: Date;
}

export type QualificationResult =
  | { readonly qualified: true; readonly value: QualifiedOffer }
  | { readonly qualified: false; readonly reason: string };

export function qualifyOffer(
  offer: NormalizedOffer,
  affiliate: AffiliateEvidence | undefined,
  policy: QualificationPolicy,
  now: Date,
): QualificationResult {
  const fail = (reason: string): QualificationResult => ({ qualified: false, reason });
  if (offer.condition !== 'new' && offer.condition !== 'NEW') return fail('NOT_NEW');
  if (!offer.available) return fail('NOT_AVAILABLE');
  if (offer.currency !== policy.value.currency) return fail('CURRENCY_MISMATCH');
  if (!offer.title.trim()) return fail('MISSING_TITLE');
  if (!/^https:\/\//.test(offer.imageUrl)) return fail('INVALID_IMAGE');
  if (
    compareDecimal(offer.discountedPrice, '0') <= 0 ||
    compareDecimal(offer.originalPrice, offer.discountedPrice) <= 0
  )
    return fail('INVALID_PRICE');

  const price = offer.discountedPrice;
  const band =
    compareDecimal(price, policy.value.lowTicketMin) >= 0 &&
    compareDecimal(price, policy.value.lowTicketMax) <= 0
      ? 'LOW'
      : compareDecimal(price, policy.value.mediumTicketMin) >= 0 &&
          compareDecimal(price, policy.value.mediumTicketMax) <= 0
        ? 'MEDIUM'
        : undefined;
  if (!band) return fail('OUTSIDE_TICKET_BANDS');

  const computedDiscount = discountPercent(offer.originalPrice, offer.discountedPrice);
  if (compareDecimal(computedDiscount, policy.value.minimumDiscountPercent) < 0)
    return fail('DISCOUNT_BELOW_MINIMUM');
  if (
    !affiliate ||
    affiliate.productId !== offer.productId ||
    affiliate.variationKey !== offer.variationKey
  )
    return fail('MISSING_OR_MISMATCHED_AFFILIATE_EVIDENCE');
  const evidenceExpiry = Math.min(
    affiliate.capturedAt.getTime() + 3_600_000,
    affiliate.validUntil?.getTime() ?? Number.POSITIVE_INFINITY,
  );
  if (affiliate.capturedAt.getTime() > now.getTime() || now.getTime() >= evidenceExpiry)
    return fail('AFFILIATE_EVIDENCE_EXPIRED');
  if (affiliate.currency !== offer.currency || !/^https:\/\//.test(affiliate.affiliateUrl))
    return fail('INVALID_AFFILIATE_EVIDENCE');

  let commissionPercent: string;
  let expectedCommissionAmount: string;
  try {
    commissionPercent = affiliate.commissionPercent;
    decimalToUnits(commissionPercent, 4);
    if (compareDecimal(commissionPercent, '0') <= 0 || compareDecimal(commissionPercent, '100') > 0)
      return fail('INVALID_COMMISSION');
    const derived = commissionAmount(price, commissionPercent);
    expectedCommissionAmount = affiliate.expectedCommissionAmount ?? derived;
    if (compareDecimal(expectedCommissionAmount, '0') <= 0) return fail('INVALID_COMMISSION');
    const observedCents = decimalToUnits(expectedCommissionAmount, 2);
    const derivedCents = decimalToUnits(derived, 2);
    const difference =
      observedCents > derivedCents ? observedCents - derivedCents : derivedCents - observedCents;
    if (affiliate.expectedCommissionAmount && difference > 1n) return fail('COMMISSION_MISMATCH');
  } catch {
    return fail('INVALID_COMMISSION');
  }

  return {
    qualified: true,
    value: {
      offer,
      affiliate,
      discountAmount: formatUnits(decimalToUnits(offer.originalPrice) - decimalToUnits(price)),
      discountPercent: computedDiscount,
      expectedCommissionAmount,
      commissionPercent,
      ticketBand: band,
      capturedAt: now,
    },
  };
}
