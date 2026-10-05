import { chmod, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LocalEnvFile,
  loadLocalEnvironment,
  type LocalEnvFileOperations,
} from '../../../src/modules/mercado-livre-authorization/infrastructure/config/local-env-file.js';

const directories: string[] = [];

async function tempEnvPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'meli-oauth-'));
  directories.push(directory);
  return join(directory, '.env');
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('LocalEnvFile', () => {
  it('creates an owner-only env file without exposing the token through its API', async () => {
    const filePath = await tempEnvPath();
    const store = new LocalEnvFile(filePath);

    const result = await store.save('refresh-token-secret');

    expect(result).toBeUndefined();
    expect(await readFile(filePath, 'utf8')).toBe("MELI_REFRESH_TOKEN='refresh-token-secret'\n");
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });

  it('preserves unrelated content and leaves exactly one active refresh token', async () => {
    const filePath = await tempEnvPath();
    const original = [
      '# comment with MELI_REFRESH_TOKEN=do-not-touch',
      'OTHER="value with spaces and \'quotes\'"',
      'MELI_REFRESH_TOKEN=old-token',
      'export MELI_REFRESH_TOKEN=duplicate-token',
      'LAST=value',
      '',
    ].join('\n');
    await writeFile(filePath, original, { mode: 0o644 });
    const store = new LocalEnvFile(filePath);

    await store.save("new'token");

    const updated = await readFile(filePath, 'utf8');
    expect(updated).toContain('# comment with MELI_REFRESH_TOKEN=do-not-touch');
    expect(updated).toContain('OTHER="value with spaces and \'quotes\'"');
    expect(updated).toContain('LAST=value');
    expect(updated.match(/^\s*(?:export\s+)?MELI_REFRESH_TOKEN\s*=/gmu)).toHaveLength(1);
    expect(updated).toContain("MELI_REFRESH_TOKEN='new'\"'\"'token'");
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });

  it('loads local values while giving precedence to the process environment', async () => {
    const filePath = await tempEnvPath();
    await writeFile(
      filePath,
      "MELI_CLIENT_ID=file-id\nMELI_CLIENT_SECRET='file-secret'\nMELI_REDIRECT_URI=https://app.example/callback\n",
    );

    const values = await loadLocalEnvironment(filePath, {
      MELI_CLIENT_ID: 'process-id',
    });

    expect(values).toMatchObject({
      MELI_CLIENT_ID: 'process-id',
      MELI_CLIENT_SECRET: 'file-secret',
      MELI_REDIRECT_URI: 'https://app.example/callback',
    });
  });

  it('keeps the original file intact when the atomic rename fails', async () => {
    const filePath = await tempEnvPath();
    await writeFile(filePath, 'OTHER=value\nMELI_REFRESH_TOKEN=old-token\n');
    const actual = new LocalEnvFile(filePath).operations;
    const operations: LocalEnvFileOperations = {
      ...actual,
      rename: vi.fn().mockRejectedValue(new Error('rename failed')),
    };
    const store = new LocalEnvFile(filePath, operations);

    await expect(store.save('new-token')).rejects.toThrow();

    expect(await readFile(filePath, 'utf8')).toBe('OTHER=value\nMELI_REFRESH_TOKEN=old-token\n');
    await chmod(filePath, 0o600);
  });
});
