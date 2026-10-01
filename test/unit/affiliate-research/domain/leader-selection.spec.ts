import { describe, expect, it } from 'vitest';
import {
  compareLeaders,
  leadersByCategory,
} from '../../../../src/modules/affiliate-research/domain/services/leader-selection.js';
import type { QualifiedOffer } from '../../../../src/modules/affiliate-research/domain/services/offer-qualification.js';

const candidate = (
  categoryId: string,
  position: number,
  discountPercent: string,
  commissionAmount: string,
): Parameters<typeof leadersByCategory>[0][number] => ({
  categoryId,
  position,
  assessmentKey: `${categoryId}-${position}`,
  observedAt: new Date('2026-10-01T10:00:00Z'),
  qualified: { discountPercent, expectedCommissionAmount: commissionAmount } as QualifiedOffer,
});

describe('category leader selection', () => {
  it('keeps only the earliest qualified position in each category', () => {
    const leaders = leadersByCategory([
      candidate('MLB2', 3, '90', '1'),
      candidate('MLB1', 2, '20', '1'),
      candidate('MLB1', 1, '10', '1'),
    ]);
    expect(leaders.map(({ categoryId, position }) => [categoryId, position])).toEqual([
      ['MLB1', 1],
      ['MLB2', 3],
    ]);
  });

  it('uses discount, commission, then category ID for a deterministic tournament', () => {
    const candidates = [
      candidate('MLB3', 1, '25', '2'),
      candidate('MLB2', 1, '25', '2.01'),
      candidate('MLB1', 1, '25', '2.01'),
    ];
    expect([...candidates].sort(compareLeaders).map(({ categoryId }) => categoryId)).toEqual([
      'MLB1',
      'MLB2',
      'MLB3',
    ]);
  });
});
