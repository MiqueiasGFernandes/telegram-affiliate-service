import type { RankedReference } from '../../application/ports/out/research-ports.js';

export class RankingContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RankingContractError';
  }
}

export function mapRankingPayload(
  categoryId: string,
  payload: unknown,
  observedAt: Date,
): readonly RankedReference[] {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as Record<string, unknown>)['content'])
  )
    throw new RankingContractError('Ranking payload has no content array');
  const content = (payload as { content: unknown[] }).content;
  if (content.length > 20)
    throw new RankingContractError('Ranking exceeds documented maximum of 20 references');
  const positions = new Set<number>();
  const references = content.map((value, index): RankedReference => {
    if (!value || typeof value !== 'object')
      throw new RankingContractError('Ranking entry must be an object');
    const entry = value as Record<string, unknown>;
    if (
      !['ITEM', 'PRODUCT', 'USER_PRODUCT'].includes(String(entry['type'])) ||
      typeof entry['id'] !== 'string' ||
      !entry['id']
    )
      throw new RankingContractError('Ranking entry type or ID is invalid');
    const reported = entry['position'];
    if (
      reported !== undefined &&
      (!Number.isInteger(reported) || Number(reported) < 1 || Number(reported) > 20)
    )
      throw new RankingContractError('Reported ranking position is invalid');
    const effectivePosition = reported === undefined ? index + 1 : Number(reported);
    if (positions.has(effectivePosition))
      throw new RankingContractError('Ranking positions must be unique');
    positions.add(effectivePosition);
    return {
      categoryId,
      effectivePosition,
      ...(reported === undefined ? {} : { reportedPosition: Number(reported) }),
      type: entry['type'] as RankedReference['type'],
      sourceId: entry['id'],
      observedAt,
    };
  });
  return references.sort((a, b) => a.effectivePosition - b.effectivePosition);
}
