import { describe, expect, it } from 'vitest';
import {
  compareLeaders,
  leadersByCategory,
} from '../../../../src/modules/affiliate-research/domain/services/leader-selection.js';
import type { QualifiedOffer } from '../../../../src/modules/affiliate-research/domain/services/offer-qualification.js';

describe('candidate promotion after revalidation', () => {
  it('promotes the next candidate in the failed leader category and recalculates the tournament', () => {
    const queue = [
      {
        categoryId: 'MLB1',
        position: 1,
        assessmentKey: 'bad',
        observedAt: new Date(),
        qualified: { discountPercent: '50', expectedCommissionAmount: '2' } as QualifiedOffer,
      },
      {
        categoryId: 'MLB1',
        position: 2,
        assessmentKey: 'next',
        observedAt: new Date(),
        qualified: { discountPercent: '20', expectedCommissionAmount: '8' } as QualifiedOffer,
      },
      {
        categoryId: 'MLB2',
        position: 1,
        assessmentKey: 'other',
        observedAt: new Date(),
        qualified: { discountPercent: '30', expectedCommissionAmount: '3' } as QualifiedOffer,
      },
    ];
    const promoted = leadersByCategory(
      queue.filter(({ assessmentKey }) => assessmentKey !== 'bad'),
    ).sort(compareLeaders);
    expect(promoted[0]?.assessmentKey).toBe('other');
  });
});
