import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('standalone process', () => {
  it('uses a Nest application context and does not create an HTTP listener', () => {
    const source = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
    expect(source).toContain('createApplicationContext');
    expect(source).not.toContain('NestFactory.create(');
    expect(source).not.toContain('listen(');
  });
});
