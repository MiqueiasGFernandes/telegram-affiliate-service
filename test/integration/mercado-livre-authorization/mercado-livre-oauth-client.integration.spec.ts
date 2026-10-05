import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { MercadoLivreOAuthClient } from '../../../src/modules/mercado-livre-authorization/infrastructure/oauth/mercado-livre-oauth.client.js';

const exchangeInput = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://app.example/callback',
  code: 'authorization-code',
  codeVerifier: 'code-verifier',
};

describe('MercadoLivreOAuthClient', () => {
  it('creates an official authorization URL with unpredictable state and PKCE S256', () => {
    const client = new MercadoLivreOAuthClient({ timeoutMs: 10_000 });

    const attempt = client.createAttempt({
      clientId: 'client-id',
      redirectUri: 'https://app.example/callback',
    });

    const url = new URL(attempt.authorizationUrl);
    expect(url.origin).toBe('https://auth.mercadolivre.com.br');
    expect(url.pathname).toBe('/authorization');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example/callback');
    expect(url.searchParams.get('state')).toBe(attempt.state);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(attempt.codeVerifier).digest('base64url'),
    );
    expect(attempt.state.length).toBeGreaterThanOrEqual(32);
    expect(attempt.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(attempt.authorizationUrl).not.toContain(attempt.codeVerifier);
  });

  it('exchanges the code using a form body and maps only the refresh token', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access-token-secret',
          expires_in: 21_600,
          refresh_token: 'refresh-token-secret',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const client = new MercadoLivreOAuthClient({ timeoutMs: 10_000, fetchFn });

    const result = await client.exchangeCode(exchangeInput);

    expect(result).toEqual({ refreshToken: 'refresh-token-secret' });
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.mercadolibre.com/oauth/token');
    expect(init.method).toBe('POST');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.body).toBeInstanceOf(URLSearchParams);
    expect(Object.fromEntries((init.body as URLSearchParams).entries())).toEqual({
      grant_type: 'authorization_code',
      client_id: 'client-id',
      client_secret: 'client-secret',
      code: 'authorization-code',
      redirect_uri: 'https://app.example/callback',
      code_verifier: 'code-verifier',
    });
  });

  it('translates timeout without exposing request values', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new DOMException('client-secret', 'TimeoutError'));
    const client = new MercadoLivreOAuthClient({ timeoutMs: 1_000, fetchFn });

    const failure = await client.exchangeCode(exchangeInput).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'TOKEN_TIMEOUT' });
    expect(String(failure)).not.toContain('client-secret');
  });

  it('does not expose a rejected remote response body', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('refresh-token-secret', { status: 400 }));
    const client = new MercadoLivreOAuthClient({ timeoutMs: 10_000, fetchFn });

    const failure = await client.exchangeCode(exchangeInput).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'TOKEN_REJECTED' });
    expect(String(failure)).not.toContain('refresh-token-secret');
  });

  it.each([
    new Response('refresh-token-secret', { status: 200 }),
    new Response(JSON.stringify({ access_token: 'access-token-secret' }), { status: 200 }),
    new Response(JSON.stringify({ refresh_token: 'invalid\nvalue' }), { status: 200 }),
  ])('rejects malformed token responses without exposing their contents', async (response) => {
    const client = new MercadoLivreOAuthClient({
      timeoutMs: 10_000,
      fetchFn: vi.fn().mockResolvedValue(response),
    });

    const failure = await client.exchangeCode(exchangeInput).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'TOKEN_RESPONSE_INVALID' });
    expect(String(failure)).not.toMatch(/access-token-secret|invalid\s*value/);
  });
});
