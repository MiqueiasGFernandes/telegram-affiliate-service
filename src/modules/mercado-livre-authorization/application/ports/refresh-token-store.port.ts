export interface RefreshTokenStorePort {
  save(refreshToken: string): Promise<void>;
}
