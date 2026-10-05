import { chmod, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { RefreshTokenStorePort } from '../../application/ports/refresh-token-store.port.js';

export interface LocalEnvFileOperations {
  readonly readFile: (path: string) => Promise<string>;
  readonly writeFile: (path: string, content: string) => Promise<void>;
  readonly rename: (source: string, destination: string) => Promise<void>;
  readonly chmod: (path: string, mode: number) => Promise<void>;
  readonly unlink: (path: string) => Promise<void>;
}

const nodeOperations: LocalEnvFileOperations = {
  readFile: (path) => readFile(path, 'utf8'),
  writeFile: async (path, content) => {
    await writeFile(path, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  },
  rename,
  chmod,
  unlink,
};

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function updatedEnvContent(content: string, refreshToken: string): string {
  if (!refreshToken || /[\r\n\0]/u.test(refreshToken)) throw new Error('Invalid refresh token');
  const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
  const hadFinalLineEnding = content.endsWith('\n');
  const lines = content ? content.split(/\r?\n/u) : [];
  if (hadFinalLineEnding) lines.pop();
  const assignment = `MELI_REFRESH_TOKEN=${shellSingleQuote(refreshToken)}`;
  const target = /^\s*(?:export\s+)?MELI_REFRESH_TOKEN\s*=/u;
  let replaced = false;
  const updated: string[] = [];
  for (const line of lines) {
    if (!target.test(line)) {
      updated.push(line);
      continue;
    }
    if (!replaced) {
      updated.push(assignment);
      replaced = true;
    }
  }
  if (!replaced) updated.push(assignment);
  return `${updated.join(lineEnding)}${lineEnding}`;
}

function parseEnvValue(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"'))
    return value
      .slice(1, -1)
      .replaceAll('\\n', '\n')
      .replaceAll('\\r', '\r')
      .replaceAll('\\"', '"')
      .replaceAll('\\\\', '\\');
  return value;
}

export async function loadLocalEnvironment(
  filePath: string,
  processEnvironment: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, string>> {
  let content = '';
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  const values: Record<string, string> = {};
  for (const line of content.split(/\r?\n/u)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/u.exec(line);
    if (match?.[1] && match[2] !== undefined) values[match[1]] = parseEnvValue(match[2]);
  }
  for (const [key, value] of Object.entries(processEnvironment)) {
    if (value !== undefined) values[key] = value;
  }
  return values;
}

export class LocalEnvFile implements RefreshTokenStorePort {
  constructor(
    private readonly filePath: string,
    readonly operations: LocalEnvFileOperations = nodeOperations,
  ) {}

  async save(refreshToken: string): Promise<void> {
    let content = '';
    try {
      content = await this.operations.readFile(this.filePath);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
    const updated = updatedEnvContent(content, refreshToken);
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await this.operations.writeFile(temporaryPath, updated);
      await this.operations.chmod(temporaryPath, 0o600);
      await this.operations.rename(temporaryPath, this.filePath);
    } catch (error) {
      await this.operations.unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }
}
