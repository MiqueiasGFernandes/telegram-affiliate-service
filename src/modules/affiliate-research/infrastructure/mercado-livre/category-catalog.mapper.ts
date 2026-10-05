import { MAX_RESEARCH_CATEGORIES } from '../../domain/policies/qualification-policy.js';
import type { DiscoveredLeafCategory } from '../../application/ports/out/research-ports.js';

interface CategoryNode {
  readonly id?: unknown;
  readonly total_items_in_this_category?: unknown;
  readonly children_categories?: unknown;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function roots(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!record(payload)) throw new Error('Mercado Livre category catalog is malformed');
  if (Array.isArray(payload['categories'])) return payload['categories'];
  if (record(payload['categories'])) return Object.values(payload['categories']);
  if (typeof payload['id'] === 'string') return [payload];
  return Object.values(payload);
}

/** Selects active MLB leaf categories by listing volume, with a stable ID tie-breaker. */
export function mapTopLeafCategories(payload: unknown, limit: number): DiscoveredLeafCategory[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESEARCH_CATEGORIES)
    throw new Error(`Category limit must be an integer from 1 to ${MAX_RESEARCH_CATEGORIES}`);

  const leaves = new Map<string, number>();
  const visit = (value: unknown): void => {
    if (!record(value)) throw new Error('Mercado Livre category catalog contains an invalid node');
    const node = value as CategoryNode;
    const children = node.children_categories;
    if (!Array.isArray(children)) throw new Error('Mercado Livre category node has no child list');
    if (children.length > 0) {
      for (const child of children) visit(child);
      return;
    }

    if (typeof node.id !== 'string' || !/^MLB\d+$/.test(node.id))
      throw new Error('Mercado Livre category leaf has an invalid MLB identifier');
    const count = node.total_items_in_this_category;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0)
      throw new Error(`Mercado Livre category ${node.id} has an invalid item count`);
    if (count > 0) leaves.set(node.id, count);
  };

  for (const root of roots(payload)) visit(root);
  return [...leaves.entries()]
    .map(([categoryId, itemCount]) => ({ categoryId, itemCount }))
    .sort((a, b) => b.itemCount - a.itemCount || a.categoryId.localeCompare(b.categoryId))
    .slice(0, limit);
}
