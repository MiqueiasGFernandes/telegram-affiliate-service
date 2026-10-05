import { createInterface } from 'node:readline/promises';
import { Writable, type Readable } from 'node:stream';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AuthorizationInteractionPort } from '../../application/ports/authorization-interaction.port.js';
import {
  AuthorizeMercadoLivreUseCase,
  MercadoLivreAuthorizationError,
} from '../../application/use-cases/authorize-mercado-livre.use-case.js';
import { LocalEnvFile, loadLocalEnvironment } from '../config/local-env-file.js';
import { MercadoLivreOAuthClient } from '../oauth/mercado-livre-oauth.client.js';

export class TerminalAuthorizationInteraction implements AuthorizationInteractionPort {
  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
  ) {}

  async requestCallbackUrl(authorizationUrl: string): Promise<string> {
    this.output.write('\nAbra esta URL no navegador e autorize a aplicação:\n\n');
    this.output.write(`${authorizationUrl}\n\n`);
    this.output.write(
      'Cole a URL completa recebida após a autorização (a entrada ficará oculta): ',
    );
    const hiddenOutput = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    const terminal = createInterface({ input: this.input, output: hiddenOutput, terminal: true });
    try {
      const callbackUrl = await terminal.question('');
      this.output.write('\n');
      return callbackUrl;
    } finally {
      terminal.close();
    }
  }
}

export interface AuthorizationCommandOptions {
  readonly interactive: boolean;
  readonly execute: () => Promise<unknown>;
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
}

export async function runAuthorizationCommand(
  options: AuthorizationCommandOptions,
): Promise<0 | 1> {
  try {
    if (!options.interactive)
      throw new MercadoLivreAuthorizationError('INTERACTIVE_TERMINAL_REQUIRED');
    await options.execute();
    options.stdout(
      'Autorização concluída. MELI_REFRESH_TOKEN foi salvo sem ser exibido.\n' +
        'A rotação futura do token em produção ainda requer armazenamento durável.\n',
    );
    return 0;
  } catch (error) {
    if (error instanceof MercadoLivreAuthorizationError) {
      options.stderr(`[${error.code}] ${error.message}\n`);
    } else {
      options.stderr('[UNEXPECTED_ERROR] A autorização não pôde ser concluída com segurança.\n');
    }
    return 1;
  }
}

function requiredConfiguration(values: Record<string, string>, key: string): string {
  const value = values[key]?.trim();
  if (!value || value === 'replace-me')
    throw new MercadoLivreAuthorizationError('INVALID_CONFIGURATION');
  return value;
}

function httpTimeout(values: Record<string, string>): number {
  const raw = values['MELI_HTTP_TIMEOUT_MS']?.trim() || '10000';
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1_000 || value > 30_000)
    throw new MercadoLivreAuthorizationError('INVALID_CONFIGURATION');
  return value;
}

export async function main(): Promise<0 | 1> {
  const envFilePath = resolve(process.cwd(), '.env');
  return runAuthorizationCommand({
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    execute: async () => {
      const values = await loadLocalEnvironment(envFilePath);
      const input = {
        clientId: requiredConfiguration(values, 'MELI_CLIENT_ID'),
        clientSecret: requiredConfiguration(values, 'MELI_CLIENT_SECRET'),
        redirectUri: requiredConfiguration(values, 'MELI_REDIRECT_URI'),
      };
      const interaction = new TerminalAuthorizationInteraction(process.stdin, process.stdout);
      const gateway = new MercadoLivreOAuthClient({ timeoutMs: httpTimeout(values) });
      const store = new LocalEnvFile(envFilePath);
      const useCase = new AuthorizeMercadoLivreUseCase(interaction, gateway, store);
      await useCase.execute(input);
    },
    stdout: (message) => process.stdout.write(message),
    stderr: (message) => process.stderr.write(message),
  });
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href)
  process.exitCode = await main();
