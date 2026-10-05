import { describe, expect, it, vi } from 'vitest';
import type { AuthorizationInteractionPort } from '../../../src/modules/mercado-livre-authorization/application/ports/authorization-interaction.port.js';
import type { AuthorizationTokenGatewayPort } from '../../../src/modules/mercado-livre-authorization/application/ports/authorization-token-gateway.port.js';
import type { RefreshTokenStorePort } from '../../../src/modules/mercado-livre-authorization/application/ports/refresh-token-store.port.js';
import {
  AuthorizeMercadoLivreUseCase,
  MercadoLivreAuthorizationError,
} from '../../../src/modules/mercado-livre-authorization/application/use-cases/authorize-mercado-livre.use-case.js';

function dependencies(callbackUrl: string) {
  const interaction: AuthorizationInteractionPort = {
    requestCallbackUrl: vi.fn().mockResolvedValue(callbackUrl),
  };
  const gateway: AuthorizationTokenGatewayPort = {
    createAttempt: vi.fn().mockReturnValue({
      authorizationUrl: 'https://auth.mercadolivre.com.br/authorization?state=state-123',
      redirectUri: 'https://app.example/callback',
      state: 'state-123',
      codeVerifier: 'verifier-123',
    }),
    exchangeCode: vi.fn().mockResolvedValue({ refreshToken: 'refresh-token-secret' }),
  };
  const store: RefreshTokenStorePort = { save: vi.fn().mockResolvedValue(undefined) };
  return { interaction, gateway, store };
}

const input = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://app.example/callback',
};

describe('AuthorizeMercadoLivreUseCase', () => {
  it('exchanges a valid callback and stores the refresh token without returning it', async () => {
    const interaction: AuthorizationInteractionPort = {
      requestCallbackUrl: vi
        .fn()
        .mockResolvedValue('https://app.example/callback?code=authorization-code&state=state-123'),
    };
    const gateway: AuthorizationTokenGatewayPort = {
      createAttempt: vi.fn().mockReturnValue({
        authorizationUrl: 'https://auth.mercadolivre.com.br/authorization?state=state-123',
        redirectUri: 'https://app.example/callback',
        state: 'state-123',
        codeVerifier: 'verifier-123',
      }),
      exchangeCode: vi.fn().mockResolvedValue({ refreshToken: 'refresh-token-secret' }),
    };
    const store: RefreshTokenStorePort = { save: vi.fn().mockResolvedValue(undefined) };
    const useCase = new AuthorizeMercadoLivreUseCase(interaction, gateway, store);

    const result = await useCase.execute({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'https://app.example/callback',
    });

    expect(result).toEqual({ stored: true });
    expect(interaction.requestCallbackUrl).toHaveBeenCalledWith(
      'https://auth.mercadolivre.com.br/authorization?state=state-123',
    );
    expect(gateway.exchangeCode).toHaveBeenCalledWith({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'https://app.example/callback',
      code: 'authorization-code',
      codeVerifier: 'verifier-123',
    });
    expect(store.save).toHaveBeenCalledWith('refresh-token-secret');
    expect(JSON.stringify(result)).not.toContain('refresh-token-secret');
  });

  it.each([
    ['not a URL', 'INVALID_CALLBACK'],
    ['https://attacker.example/callback?code=code&state=state-123', 'INVALID_CALLBACK'],
    ['https://app.example/callback?error=access_denied&state=state-123', 'AUTHORIZATION_DENIED'],
    ['https://app.example/callback?code=code&state=another-state', 'STATE_MISMATCH'],
    ['https://app.example/callback?state=state-123', 'INVALID_CALLBACK'],
  ] as const)('rejects callback %s without exchanging or storing', async (callbackUrl, code) => {
    const { interaction, gateway, store } = dependencies(callbackUrl);
    const useCase = new AuthorizeMercadoLivreUseCase(interaction, gateway, store);

    await expect(useCase.execute(input)).rejects.toMatchObject({ code });
    expect(gateway.exchangeCode).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('translates storage failure without exposing the refresh token', async () => {
    const { interaction, gateway, store } = dependencies(
      'https://app.example/callback?code=authorization-code&state=state-123',
    );
    vi.mocked(store.save).mockRejectedValue(new Error('refresh-token-secret'));
    const useCase = new AuthorizeMercadoLivreUseCase(interaction, gateway, store);

    const failure = await useCase.execute(input).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MercadoLivreAuthorizationError);
    expect(failure).toMatchObject({ code: 'STORAGE_FAILED' });
    expect(String(failure)).not.toContain('refresh-token-secret');
  });
});
