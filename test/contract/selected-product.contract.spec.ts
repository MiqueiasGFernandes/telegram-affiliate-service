import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AnySchema } from 'ajv';
import { validateJsonSchema } from '../../src/platform/contract/json-schema-validator.js';

const schema = JSON.parse(
  readFileSync(
    new URL(
      '../../specs/001-qualify-affiliate-products/contracts/selected-product.schema.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as AnySchema;
const product = {
  schemaVersion: 1,
  runId: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  executionKey: 'run-1',
  productId: 'MLB1',
  variationKey: 'NO_VARIATION',
  categoryId: 'MLB1000',
  categoryPosition: 2,
  title: 'Produto válido',
  ticketBand: 'LOW',
  currency: 'BRL',
  originalPrice: '100.00',
  discountedPrice: '80.00',
  discountAmount: '20.00',
  discountPercent: '20.0000',
  affiliateUrl: 'https://meli.la/abc',
  expectedCommissionAmount: '8.00',
  commissionPercent: '10.0000',
  commissionDerivation: { percentDerived: false, amountDerived: true },
  mainImageUrl: 'https://img.example/product.jpg',
  salesEvidence: {
    kind: 'BEST_SELLER_RANK',
    value: 2,
    source: '/highlights/MLB/category/MLB1000',
    observedAt: '2026-10-01T10:00:00Z',
  },
  selectionRationale: ['Líder da categoria MLB1000 após revalidação'],
  capturedAt: '2026-10-01T10:00:00Z',
  validatedAt: '2026-10-01T10:01:00Z',
};

describe('selected product schema contract', () => {
  it('accepts the complete affiliate handoff and rejects a partial payload', () => {
    expect(validateJsonSchema(schema, product)).toEqual([]);
    expect(
      validateJsonSchema(schema, { ...product, affiliateUrl: undefined }).length,
    ).toBeGreaterThan(0);
  });
});
