import type { AuthorizationInteractionPort } from '../ports/authorization-interaction.port.js';
import type { AuthorizationTokenGatewayPort } from '../ports/authorization-token-gateway.port.js';
import type { RefreshTokenStorePort } from '../ports/refresh-token-store.port.js';

export type AuthorizationErrorCode =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_CALLBACK'
  | 'AUTHORIZATION_DENIED'
  | 'STATE_MISMATCH'
  | 'TOKEN_TIMEOUT'
  | 'TOKEN_UNAVAILABLE'
  | 'TOKEN_REJECTED'
  | 'TOKEN_RESPONSE_INVALID'
  | 'STORAGE_FAILED'
  | 'INTERACTIVE_TERMINAL_REQUIRED';

const safeMessages: Record<AuthorizationErrorCode, string> = {
  INVALID_CONFIGURATION:
    'Configure MELI_CLIENT_ID, MELI_CLIENT_SECRET e uma MELI_REDIRECT_URI HTTPS válida.',
  INVALID_CALLBACK: 'Informe a URL completa recebida após a autorização do Mercado Livre.',
  AUTHORIZATION_DENIED: 'A autorização foi negada. Inicie uma nova tentativa e conceda o acesso.',
  STATE_MISMATCH: 'O retorno não pertence a esta tentativa. Inicie uma nova autorização.',
  TOKEN_TIMEOUT: 'O Mercado Livre não respondeu no tempo esperado. Tente novamente.',
  TOKEN_UNAVAILABLE: 'Não foi possível contatar o Mercado Livre. Tente novamente.',
  TOKEN_REJECTED: 'O Mercado Livre recusou o código. Inicie uma nova autorização.',
  TOKEN_RESPONSE_INVALID: 'O Mercado Livre não retornou um refresh token válido.',
  STORAGE_FAILED: 'Não foi possível salvar o refresh token no arquivo local.',
  INTERACTIVE_TERMINAL_REQUIRED: 'Execute este comando em um terminal interativo.',
};

export class MercadoLivreAuthorizationError extends Error {
  constructor(readonly code: AuthorizationErrorCode) {
    super(safeMessages[code]);
    this.name = 'MercadoLivreAuthorizationError';
  }
}

export interface AuthorizeMercadoLivreInput {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

function validatedRedirectUri(value: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash)
      throw new MercadoLivreAuthorizationError('INVALID_CONFIGURATION');
    return url;
  } catch (error) {
    if (error instanceof MercadoLivreAuthorizationError) throw error;
    throw new MercadoLivreAuthorizationError('INVALID_CONFIGURATION');
  }
}

function callbackMatchesRedirect(callback: URL, redirect: URL): boolean {
  if (
    callback.protocol !== redirect.protocol ||
    callback.username !== redirect.username ||
    callback.password !== redirect.password ||
    callback.hostname !== redirect.hostname ||
    callback.port !== redirect.port ||
    callback.pathname !== redirect.pathname ||
    callback.hash !== redirect.hash
  )
    return false;

  for (const [key, value] of redirect.searchParams) {
    if (callback.searchParams.get(key) !== value) return false;
  }
  return true;
}

export class AuthorizeMercadoLivreUseCase {
  constructor(
    private readonly interaction: AuthorizationInteractionPort,
    private readonly gateway: AuthorizationTokenGatewayPort,
    private readonly store: RefreshTokenStorePort,
  ) {}

  async execute(input: AuthorizeMercadoLivreInput): Promise<{ readonly stored: true }> {
    if (!input.clientId.trim() || !input.clientSecret.trim())
      throw new MercadoLivreAuthorizationError('INVALID_CONFIGURATION');
    const redirect = validatedRedirectUri(input.redirectUri);
    const attempt = this.gateway.createAttempt({
      clientId: input.clientId,
      redirectUri: redirect.toString(),
    });
    const callbackValue = await this.interaction.requestCallbackUrl(attempt.authorizationUrl);
    let callback: URL;
    try {
      callback = new URL(callbackValue.trim());
    } catch {
      throw new MercadoLivreAuthorizationError('INVALID_CALLBACK');
    }
    if (!callbackMatchesRedirect(callback, redirect))
      throw new MercadoLivreAuthorizationError('INVALID_CALLBACK');
    if (callback.searchParams.has('error'))
      throw new MercadoLivreAuthorizationError('AUTHORIZATION_DENIED');
    if (callback.searchParams.get('state') !== attempt.state)
      throw new MercadoLivreAuthorizationError('STATE_MISMATCH');
    const code = callback.searchParams.get('code');
    if (!code) throw new MercadoLivreAuthorizationError('INVALID_CALLBACK');

    const tokens = await this.gateway.exchangeCode({
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      redirectUri: attempt.redirectUri,
      code,
      codeVerifier: attempt.codeVerifier,
    });
    try {
      await this.store.save(tokens.refreshToken);
    } catch {
      throw new MercadoLivreAuthorizationError('STORAGE_FAILED');
    }
    return { stored: true };
  }
}
