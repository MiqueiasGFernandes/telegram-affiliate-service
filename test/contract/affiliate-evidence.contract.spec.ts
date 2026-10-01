import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  evidenceFingerprint,
  ManualAffiliateEvidenceReader,
} from '../../src/modules/affiliate-research/infrastructure/affiliate-evidence/manual-affiliate-evidence.reader.js';

const directories: string[] = [];
async function makeEvidenceFile() {
  const directory = await mkdtemp(join(tmpdir(), 'affiliate-evidence-test-'));
  directories.push(directory);
  const entry: Record<string, unknown> = {
    productId: 'MLB1',
    variationKey: 'NO_VARIATION',
    eligible: true,
    affiliateUrl: 'https://meli.la/x',
    commissionPercent: '10.5000',
    currency: 'BRL',
    capturedAt: '2026-10-01T10:00:00Z',
    source: 'CENTRAL_MANUAL',
    sourceReference: 'manual-check-1',
  };
  entry['fingerprint'] = evidenceFingerprint(entry);
  const path = join(directory, 'evidence.json');
  await writeFile(
    path,
    JSON.stringify({ schemaVersion: 1, generatedAt: '2026-10-01T10:01:00Z', entries: [entry] }),
  );
  return { path, entry };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('manual affiliate evidence contract', () => {
  it('loads a product/variation-keyed evidence file and rejects fingerprint tampering', async () => {
    const { path, entry } = await makeEvidenceFile();
    const reader = new ManualAffiliateEvidenceReader({ affiliateEvidenceFile: path });
    expect(await reader.find('MLB1', 'NO_VARIATION')).toMatchObject({
      commissionPercent: '10.5000',
      eligible: true,
    });
    entry['fingerprint'] = '0'.repeat(64);
    const document = JSON.parse(await readFile(path, 'utf8')) as {
      entries: Record<string, unknown>[];
    };
    document.entries[0] = entry;
    await writeFile(path, JSON.stringify(document));
    await expect(
      new ManualAffiliateEvidenceReader({ affiliateEvidenceFile: path }).find(
        'MLB1',
        'NO_VARIATION',
      ),
    ).rejects.toThrow('fingerprint mismatch');
  });
});
