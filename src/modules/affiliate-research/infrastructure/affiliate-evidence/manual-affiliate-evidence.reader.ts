import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AffiliateEvidenceReaderPort } from '../../application/ports/out/research-ports.js';
import type { AffiliateEvidence } from '../../domain/entities/offer.js';
import type { AppConfig } from '../../../../platform/config/environment-config.js';

type EvidenceJson = Record<string, unknown>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function evidenceFingerprint(entry: EvidenceJson): string {
  const fields = Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'fingerprint'));
  return createHash('sha256').update(canonical(fields)).digest('hex');
}

function parseDate(value: unknown, name: string): Date {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)))
    throw new Error(`Invalid affiliate evidence ${name}`);
  return new Date(value);
}

function parseEntry(entry: EvidenceJson): AffiliateEvidence {
  const requiredStrings = [
    'productId',
    'variationKey',
    'affiliateUrl',
    'commissionPercent',
    'currency',
    'sourceReference',
    'fingerprint',
  ];
  for (const key of requiredStrings)
    if (typeof entry[key] !== 'string' || !entry[key])
      throw new Error(`Affiliate evidence field ${key} is required`);
  if (
    entry['eligible'] !== true ||
    entry['source'] !== 'CENTRAL_MANUAL' ||
    entry['currency'] !== 'BRL'
  )
    throw new Error('Affiliate evidence source, eligibility or currency is invalid');
  const url = new URL(entry['affiliateUrl'] as string);
  if (url.protocol !== 'https:') throw new Error('Affiliate link must use HTTPS');
  if ((entry['sourceReference'] as string).length > 200)
    throw new Error('Affiliate evidence sourceReference is too long');
  const capturedAt = parseDate(entry['capturedAt'], 'capturedAt');
  const validUntil =
    entry['validUntil'] === undefined ? undefined : parseDate(entry['validUntil'], 'validUntil');
  if (
    typeof entry['fingerprint'] !== 'string' ||
    !/^[a-f0-9]{64}$/.test(entry['fingerprint']) ||
    evidenceFingerprint(entry) !== entry['fingerprint']
  )
    throw new Error('Affiliate evidence fingerprint mismatch');
  if (!/^(0|[1-9]\d*)(\.\d{1,4})?$/.test(entry['commissionPercent'] as string))
    throw new Error('Invalid commission percent');
  if (
    entry['expectedCommissionAmount'] !== undefined &&
    (typeof entry['expectedCommissionAmount'] !== 'string' ||
      !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(entry['expectedCommissionAmount']))
  )
    throw new Error('Invalid expected commission amount');
  return {
    productId: entry['productId'] as string,
    variationKey: entry['variationKey'] as string,
    eligible: true,
    affiliateUrl: entry['affiliateUrl'] as string,
    commissionPercent: entry['commissionPercent'] as string,
    ...(typeof entry['expectedCommissionAmount'] === 'string'
      ? { expectedCommissionAmount: entry['expectedCommissionAmount'] }
      : {}),
    currency: 'BRL',
    capturedAt,
    ...(validUntil ? { validUntil } : {}),
    fingerprint: entry['fingerprint'] as string,
  };
}

export class ManualAffiliateEvidenceReader implements AffiliateEvidenceReaderPort {
  private entriesPromise?: Promise<Map<string, AffiliateEvidence>>;
  constructor(private readonly config: Pick<AppConfig, 'affiliateEvidenceFile'>) {}

  async find(productId: string, variationKey: string): Promise<AffiliateEvidence | undefined> {
    const entries = await (this.entriesPromise ??= this.load());
    return entries.get(`${productId}:${variationKey}`);
  }

  private async load(): Promise<Map<string, AffiliateEvidence>> {
    const content = await readFile(this.config.affiliateEvidenceFile, 'utf8');
    const root: unknown = JSON.parse(content);
    if (!root || typeof root !== 'object' || Array.isArray(root))
      throw new Error('Affiliate evidence root must be an object');
    const document = root as Record<string, unknown>;
    if (
      document['schemaVersion'] !== 1 ||
      !Array.isArray(document['entries']) ||
      document['entries'].length === 0
    )
      throw new Error('Affiliate evidence document does not match schema version 1');
    parseDate(document['generatedAt'], 'generatedAt');
    const result = new Map<string, AffiliateEvidence>();
    for (const value of document['entries']) {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Affiliate evidence entry must be an object');
      const entry = parseEntry(value as EvidenceJson);
      const key = `${entry.productId}:${entry.variationKey}`;
      if (result.has(key)) throw new Error('Duplicate product and variation in affiliate evidence');
      result.set(key, entry);
    }
    return result;
  }
}
