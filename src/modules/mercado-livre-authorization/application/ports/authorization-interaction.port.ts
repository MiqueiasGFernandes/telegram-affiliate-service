export interface AuthorizationInteractionPort {
  requestCallbackUrl(authorizationUrl: string): Promise<string>;
}
