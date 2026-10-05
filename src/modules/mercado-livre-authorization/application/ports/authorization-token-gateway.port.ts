export interface AuthorizationAttempt {
  readonly authorizationUrl: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly codeVerifier: string;
}

export interface AuthorizationTokenGatewayPort {
  createAttempt(input: {
    readonly clientId: string;
    readonly redirectUri: string;
  }): AuthorizationAttempt;
  exchangeCode(input: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly redirectUri: string;
    readonly code: string;
    readonly codeVerifier: string;
  }): Promise<{ readonly refreshToken: string }>;
}
