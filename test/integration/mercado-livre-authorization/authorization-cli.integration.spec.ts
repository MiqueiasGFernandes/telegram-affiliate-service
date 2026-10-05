import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { MercadoLivreAuthorizationError } from '../../../src/modules/mercado-livre-authorization/application/use-cases/authorize-mercado-livre.use-case.js';
import {
  runAuthorizationCommand,
  TerminalAuthorizationInteraction,
} from '../../../src/modules/mercado-livre-authorization/infrastructure/cli/authorize-mercado-livre.cli.js';

describe('authorization CLI boundary', () => {
  it('reads the callback without echoing its authorization code', async () => {
    class FakeTty extends PassThrough {
      isTTY = true;
      setRawMode(): this {
        return this;
      }
    }
    const input = new FakeTty();
    const output = new PassThrough();
    let visibleOutput = '';
    output.on('data', (chunk: Buffer) => {
      visibleOutput += chunk.toString('utf8');
    });
    const interaction = new TerminalAuthorizationInteraction(input, output);
    const callbackUrl =
      'https://app.example/callback?code=authorization-code-secret&state=state-123';

    const result = interaction.requestCallbackUrl('https://auth.example/authorization');
    setImmediate(() => input.write(`${callbackUrl}\n`));

    await expect(result).resolves.toBe(callbackUrl);
    expect(visibleOutput).toContain('https://auth.example/authorization');
    expect(visibleOutput).not.toContain('authorization-code-secret');
  });

  it('rejects non-interactive execution before authorization', async () => {
    const execute = vi.fn();
    const stdout = vi.fn();
    const stderr = vi.fn();

    const exitCode = await runAuthorizationCommand({
      interactive: false,
      execute,
      stdout,
      stderr,
    });

    expect(exitCode).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('INTERACTIVE_TERMINAL_REQUIRED'));
  });

  it('prints only fixed messages for known and unexpected failures', async () => {
    const knownStderr = vi.fn();
    const unknownStderr = vi.fn();

    await runAuthorizationCommand({
      interactive: true,
      execute: vi.fn().mockRejectedValue(new MercadoLivreAuthorizationError('TOKEN_REJECTED')),
      stdout: vi.fn(),
      stderr: knownStderr,
    });
    await runAuthorizationCommand({
      interactive: true,
      execute: vi.fn().mockRejectedValue(new Error('refresh-token-secret')),
      stdout: vi.fn(),
      stderr: unknownStderr,
    });

    expect(knownStderr).toHaveBeenCalledWith(expect.stringContaining('TOKEN_REJECTED'));
    expect(JSON.stringify(knownStderr.mock.calls)).not.toContain('refresh-token-secret');
    expect(JSON.stringify(unknownStderr.mock.calls)).not.toContain('refresh-token-secret');
  });
});
