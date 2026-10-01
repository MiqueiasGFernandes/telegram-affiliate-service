import { describe, expect, it } from 'vitest';
import {
  OfferAssessment,
  deduplicateAssessments,
} from '../../../../src/modules/affiliate-research/domain/entities/offer-assessment.js';

const offer = {
  productId: 'P1',
  variationKey: 'V1',
  itemId: 'I1',
  title: 'Produto',
  condition: 'new',
  available: true,
  currency: 'BRL',
  originalPrice: '100',
  discountedPrice: '80',
  imageUrl: 'https://img.example/x',
  permalink: 'https://meli.example/x',
};

describe('offer assessment identity', () => {
  it('deduplicates by product and variation but keeps category membership separately', () => {
    const assessments = deduplicateAssessments([offer, { ...offer, itemId: 'I2' }]);
    expect(assessments.size).toBe(1);
    const assessment = new OfferAssessment(offer);
    assessment.addMembership({
      categoryId: 'MLB1',
      effectivePosition: 3,
      reportedPosition: 3,
      referenceType: 'ITEM',
      sourceId: 'I1',
      observedAt: new Date(),
    });
    assessment.addMembership({
      categoryId: 'MLB2',
      effectivePosition: 1,
      referenceType: 'PRODUCT',
      sourceId: 'P1',
      observedAt: new Date(),
    });
    expect(assessment.categoryReferences.map(({ categoryId }) => categoryId)).toEqual([
      'MLB1',
      'MLB2',
    ]);
  });
});
