import { createHash, randomBytes } from 'node:crypto';
import type {
  AuthorizationAttempt,
  AuthorizationTokenGatewayPort,
} from '../../application/ports/authorization-token-gateway.port.js';
import { MercadoLivreAuthorizationError } from '../../application/use-cases/authorize-mercado-livre.use-case.js';

const AUTHORIZATION_URL = 'https://auth.mercadolivre.com.br/authorization';
const TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';

export interface MercadoLivreOAuthClientOptions {
  readonly timeoutMs: number;
  readonly fetchFn?: typeof fetch;
}

export class MercadoLivreOAuthClient implements AuthorizationTokenGatewayPort {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: MercadoLivreOAuthClientOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  createAttempt(input: {
    readonly clientId: string;
    readonly redirectUri: string;
  }): AuthorizationAttempt {
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const authorizationUrl = new URL(AUTHORIZATION_URL);
    authorizationUrl.search = new URLSearchParams({
      response_type: 'code',
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString();
    return {
      authorizationUrl: authorizationUrl.toString(),
      redirectUri: input.redirectUri,
      state,
      codeVerifier,
    };
  }

  async exchangeCode(input: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly redirectUri: string;
    readonly code: string;
    readonly codeVerifier: string;
  }): Promise<{ readonly refreshToken: string }> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    });
    let response: Response;
    try {
      response = await this.fetchFn(TOKEN_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      if (error instanceof DOMException && ['TimeoutError', 'AbortError'].includes(error.name))
        throw new MercadoLivreAuthorizationError('TOKEN_TIMEOUT');
      throw new MercadoLivreAuthorizationError('TOKEN_UNAVAILABLE');
    }
    if (!response.ok) throw new MercadoLivreAuthorizationError('TOKEN_REJECTED');

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new MercadoLivreAuthorizationError('TOKEN_RESPONSE_INVALID');
    }
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('refresh_token' in payload) ||
      typeof payload.refresh_token !== 'string' ||
      !payload.refresh_token.trim() ||
      /[\s\0]/u.test(payload.refresh_token)
    )
      throw new MercadoLivreAuthorizationError('TOKEN_RESPONSE_INVALID');
    return { refreshToken: payload.refresh_token };
  }
}
