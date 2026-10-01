import { describe, expect, it } from 'vitest';
import { QualificationPolicy } from '../../../../src/modules/affiliate-research/domain/policies/qualification-policy.js';
import { qualifyOffer } from '../../../../src/modules/affiliate-research/domain/services/offer-qualification.js';

const fingerprint = 'a'.repeat(64);
const policy = QualificationPolicy.create({
  currency: 'BRL',
  lowTicketMin: '10',
  lowTicketMax: '99.99',
  mediumTicketMin: '100',
  mediumTicketMax: '500',
  minimumDiscountPercent: '10',
  categoryIds: ['MLB1234'],
  fingerprint,
});
const offer = {
  productId: 'MLB-1',
  variationKey: 'NO_VARIATION',
  itemId: 'MLB-1',
  title: 'Produto',
  condition: 'new',
  available: true,
  currency: 'BRL',
  originalPrice: '100.00',
  discountedPrice: '80.00',
  imageUrl: 'https://img.example/product.jpg',
  permalink: 'https://produto.mercadolivre.com.br/MLB-1',
};
const evidence = {
  productId: offer.productId,
  variationKey: offer.variationKey,
  eligible: true as const,
  affiliateUrl: 'https://meli.la/abc',
  commissionPercent: '10',
  currency: 'BRL',
  capturedAt: new Date('2026-10-01T10:00:00Z'),
  fingerprint,
};

describe('offer qualification', () => {
  it('qualifies a fresh eligible low-ticket offer and calculates exact discount/commission', () => {
    const result = qualifyOffer(offer, evidence, policy, new Date('2026-10-01T10:30:00Z'));
    expect(result.qualified).toBe(true);
    if (result.qualified)
      expect(result.value).toMatchObject({
        discountAmount: '20.00',
        discountPercent: '20.0000',
        expectedCommissionAmount: '8.00',
        ticketBand: 'LOW',
      });
  });

  it('rejects missing or expired affiliate evidence with a stable reason', () => {
    expect(qualifyOffer(offer, undefined, policy, new Date()).qualified).toBe(false);
    const result = qualifyOffer(offer, evidence, policy, new Date('2026-10-01T11:00:00Z'));
    expect(result).toEqual({ qualified: false, reason: 'AFFILIATE_EVIDENCE_EXPIRED' });
  });

  it('rejects invalid ticket and insufficient discount', () => {
    expect(
      qualifyOffer(
        { ...offer, discountedPrice: '9.99' },
        evidence,
        policy,
        new Date('2026-10-01T10:30:00Z'),
      ),
    ).toEqual({ qualified: false, reason: 'OUTSIDE_TICKET_BANDS' });
    expect(
      qualifyOffer(
        { ...offer, discountedPrice: '95.00' },
        evidence,
        policy,
        new Date('2026-10-01T10:30:00Z'),
      ),
    ).toEqual({ qualified: false, reason: 'DISCOUNT_BELOW_MINIMUM' });
  });
});
