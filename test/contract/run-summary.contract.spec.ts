import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AnySchema } from 'ajv';
import { validateJsonSchema } from '../../src/platform/contract/json-schema-validator.js';

const schema = JSON.parse(
  readFileSync(
    new URL(
      '../../specs/001-qualify-affiliate-products/contracts/run-summary.schema.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as AnySchema;
const validSummary = {
  schemaVersion: 1,
  event: 'affiliate_research.completed',
  runId: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  executionKey: 'affiliate-research:2026-10-01T10:00:00.000Z',
  mode: 'ONCE',
  status: 'COMPLETED_NO_SELECTION',
  scheduledFor: '2026-10-01T10:00:00.000Z',
  startedAt: '2026-10-01T10:00:00.000Z',
  finishedAt: '2026-10-01T10:00:01.000Z',
  durationMs: 1000,
  counts: { examined: 0, qualified: 0, rejected: 0, selected: 0 },
  rejections: [],
  categoryCoverage: {
    configured: 1,
    processedWithRanking: 0,
    processedWithoutRanking: 1,
    unavailable: 0,
    categories: [{ categoryId: 'MLB1', status: 'PROCESSED_NO_RANKING', referenceCount: 0 }],
  },
  selectedProductId: null,
  persistence: 'DISABLED',
};

describe('run summary schema contract', () => {
  it('accepts a complete terminal summary and rejects incomplete category coverage', () => {
    expect(validateJsonSchema(schema, validSummary)).toEqual([]);
    expect(
      validateJsonSchema(schema, { ...validSummary, categoryCoverage: {} }).length,
    ).toBeGreaterThan(0);
  });
});
