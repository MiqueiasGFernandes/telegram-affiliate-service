import type { AppConfig } from '../../../../platform/config/environment-config.js';
import type {
  MercadoLivreGatewayPort,
  RankedReference,
  RankingResult,
  ReferenceResolution,
} from '../../application/ports/out/research-ports.js';
import type { NormalizedOffer } from '../../domain/entities/offer.js';
import { MAX_RESEARCH_CATEGORIES } from '../../domain/policies/qualification-policy.js';
import { mapTopLeafCategories } from './category-catalog.mapper.js';
import { mapRankingPayload } from './ranking.mapper.js';

const API_BASE = 'https://api.mercadolibre.com';
const OAUTH_URL = `${API_BASE}/oauth/token`;
const MLB_CATEGORY_CATALOG_URL = `${API_BASE}/sites/MLB/categories/all`;

class MercadoLivreHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly retryAfter?: string,
  ) {
    super(`Mercado Livre returned HTTP ${status}`);
  }
}

interface OAuthToken {
  readonly accessToken: string;
  readonly expiresAt: number;
  readonly refreshToken: string;
}

export class MercadoLivreApiClient implements MercadoLivreGatewayPort {
  private token: OAuthToken | undefined;
  private readonly fetcher: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private activeRequests = 0;
  private readonly requestQueue: (() => void)[] = [];

  constructor(
    private readonly config: Pick<
      AppConfig,
      | 'meliClientId'
      | 'meliClientSecret'
      | 'meliRefreshToken'
      | 'meliHttpTimeoutMs'
      | 'meliMaxRetries'
      | 'meliMaxConcurrency'
    >,
    options: { fetcher?: typeof fetch; sleep?: (milliseconds: number) => Promise<void> } = {},
  ) {
    this.fetcher = options.fetcher ?? fetch;
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async discoverLeafCategories(limit: number) {
    const catalog = await this.getJson(MLB_CATEGORY_CATALOG_URL);
    const categories = mapTopLeafCategories(catalog, limit);
    if (categories.length === 0)
      throw new Error('Mercado Livre returned no MLB leaf categories with active listings');
    return categories;
  }

  async validateLeafCategories(categoryIds: readonly string[]): Promise<void> {
    if (
      categoryIds.length < 1 ||
      categoryIds.length > MAX_RESEARCH_CATEGORIES ||
      new Set(categoryIds).size !== categoryIds.length
    )
      throw new Error('Invalid discovered category list');
    for (const id of categoryIds) {
      const category = (await this.getJson(
        `${API_BASE}/categories/${encodeURIComponent(id)}`,
      )) as Record<string, unknown>;
      if (
        category['id'] !== id ||
        category['site_id'] !== 'MLB' ||
        !Array.isArray(category['children_categories']) ||
        category['children_categories'].length !== 0
      ) {
        throw new Error(`Configured category is not a valid MLB leaf: ${id}`);
      }
    }
  }

  async getBestSellerRanking(categoryId: string): Promise<RankingResult> {
    const observedAt = new Date();
    try {
      const payload = await this.getJson(
        `${API_BASE}/highlights/MLB/category/${encodeURIComponent(categoryId)}?limit=20`,
      );
      return {
        kind: 'RANKING_AVAILABLE',
        references: mapRankingPayload(categoryId, payload, observedAt),
        observedAt,
      };
    } catch (error) {
      if (
        error instanceof MercadoLivreHttpError &&
        error.status === 404 &&
        /Dimension CATEGORY with id .+ not found/i.test(error.body)
      )
        return { kind: 'NO_RANKING', observedAt };
      return {
        kind: 'UNAVAILABLE',
        failureCode:
          error instanceof MercadoLivreHttpError
            ? `HTTP_${error.status}`
            : error instanceof Error && error.name === 'AbortError'
              ? 'TIMEOUT'
              : 'GATEWAY_ERROR',
        observedAt,
      };
    }
  }

  async resolveRankedReferences(reference: RankedReference): Promise<ReferenceResolution> {
    try {
      if (reference.type === 'ITEM') return await this.resolveItem(reference.sourceId);
      if (reference.type === 'PRODUCT') {
        const product = (await this.getJson(
          `${API_BASE}/products/${encodeURIComponent(reference.sourceId)}`,
        )) as Record<string, unknown>;
        const winner = product['buy_box_winner'];
        if (
          !winner ||
          typeof winner !== 'object' ||
          typeof (winner as Record<string, unknown>)['item_id'] !== 'string'
        )
          return { kind: 'REJECTED', reason: 'PRODUCT_HAS_NO_PURCHASABLE_WINNER' };
        const result = await this.resolveItem(
          (winner as Record<string, unknown>)['item_id'] as string,
        );
        if (result.kind !== 'RESOLVED') return result;
        if (result.offer.productId !== reference.sourceId)
          return { kind: 'REJECTED', reason: 'PRODUCT_ITEM_MISMATCH' };
        return result;
      }

      const userProduct = (await this.getJson(
        `${API_BASE}/user-products/${encodeURIComponent(reference.sourceId)}`,
      )) as Record<string, unknown>;
      let itemIds: string[] = [];
      if (typeof userProduct['item_id'] === 'string') itemIds = [userProduct['item_id']];
      else if (
        typeof userProduct['user_id'] === 'string' ||
        typeof userProduct['user_id'] === 'number'
      ) {
        const sellerId = String(userProduct['user_id']);
        const search = (await this.getJson(
          `${API_BASE}/users/${encodeURIComponent(sellerId)}/items/search?user_product_id=${encodeURIComponent(reference.sourceId)}`,
        )) as Record<string, unknown>;
        itemIds = Array.isArray(search['results'])
          ? search['results'].filter((id): id is string => typeof id === 'string')
          : [];
      }
      if (itemIds.length !== 1)
        return {
          kind: 'REJECTED',
          reason:
            itemIds.length === 0
              ? 'USER_PRODUCT_HAS_NO_SALE_CONDITION'
              : 'USER_PRODUCT_SALE_CONDITION_AMBIGUOUS',
        };
      const result = await this.resolveItem(itemIds[0]!);
      if (result.kind !== 'RESOLVED') return result;
      if (result.offer.userProductId !== reference.sourceId)
        return { kind: 'REJECTED', reason: 'USER_PRODUCT_ITEM_MISMATCH' };
      return result;
    } catch (error) {
      return {
        kind: 'UNAVAILABLE',
        failureCode:
          error instanceof MercadoLivreHttpError
            ? `HTTP_${error.status}`
            : error instanceof Error && error.name === 'TimeoutError'
              ? 'TIMEOUT'
              : 'REFERENCE_LOOKUP_FAILED',
      };
    }
  }

  async getCurrentOffer(itemId: string): Promise<NormalizedOffer> {
    const result = await this.resolveItem(itemId);
    if (result.kind !== 'RESOLVED')
      throw new Error('Offer could not be revalidated through documented item operations');
    return result.offer;
  }

  async validateAffiliateDestination(
    affiliateUrl: string,
    productId: string,
    itemId: string,
  ): Promise<boolean> {
    const allowedHosts = new Set([
      'meli.la',
      'mercadolivre.com.br',
      'www.mercadolivre.com.br',
      'mercadolibre.com',
      'www.mercadolibre.com',
    ]);
    let destination: URL;
    try {
      destination = new URL(affiliateUrl);
    } catch {
      return false;
    }
    if (destination.protocol !== 'https:' || !allowedHosts.has(destination.hostname.toLowerCase()))
      return false;
    for (let redirects = 0; redirects <= 8; redirects++) {
      const response = await this.fetchLimited(destination, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(this.config.meliHttpTimeoutMs),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return false;
        destination = new URL(location, destination);
        if (
          destination.protocol !== 'https:' ||
          !allowedHosts.has(destination.hostname.toLowerCase())
        )
          return false;
        continue;
      }
      if (!response.ok) return false;
      const path = decodeURIComponent(destination.pathname).toLowerCase();
      return path.includes(productId.toLowerCase()) || path.includes(itemId.toLowerCase());
    }
    return false;
  }

  private async resolveItem(itemId: string): Promise<ReferenceResolution> {
    const item = (await this.getJson(`${API_BASE}/items/${encodeURIComponent(itemId)}`)) as Record<
      string,
      unknown
    >;
    const variations = Array.isArray(item['variations']) ? item['variations'] : [];
    if (variations.length > 0) return { kind: 'REJECTED', reason: 'VARIATION_ID_NOT_RESOLVABLE' };
    const prices = (await this.getJson(
      `${API_BASE}/items/${encodeURIComponent(itemId)}/prices`,
    )) as Record<string, unknown>;
    const normalized = this.mapItem(item, prices);
    if (!normalized) return { kind: 'REJECTED', reason: 'OFFER_FIELDS_INCOMPLETE' };
    if (!(await this.isImageAccessible(normalized.imageUrl)))
      return { kind: 'REJECTED', reason: 'IMAGE_UNAVAILABLE' };
    return { kind: 'RESOLVED', offer: normalized };
  }

  private mapItem(
    item: Record<string, unknown>,
    priceResponse: Record<string, unknown>,
  ): NormalizedOffer | undefined {
    const id = item['id'];
    const currency = item['currency_id'];
    const title = item['title'];
    const condition = item['condition'];
    const status = item['status'];
    const permalink = item['permalink'];
    const pictures = Array.isArray(item['pictures'])
      ? (item['pictures'] as Record<string, unknown>[])
      : [];
    const imageUrl = pictures[0]?.['secure_url'] ?? item['secure_thumbnail'] ?? item['thumbnail'];
    const priceRecords = Array.isArray(priceResponse['prices'])
      ? (priceResponse['prices'] as Record<string, unknown>[])
      : [];
    const standard = priceRecords.find((price) => price['type'] === 'standard');
    const currentPrice = standard?.['amount'];
    const regularPrice = standard?.['regular_amount'];
    if (
      typeof id !== 'string' ||
      typeof title !== 'string' ||
      typeof currency !== 'string' ||
      typeof condition !== 'string' ||
      typeof permalink !== 'string' ||
      typeof imageUrl !== 'string' ||
      typeof currentPrice !== 'number' ||
      typeof regularPrice !== 'number'
    )
      return undefined;
    if (!permalink.startsWith('https://') || !imageUrl.startsWith('https://')) return undefined;
    return {
      productId: String(item['catalog_product_id'] ?? id),
      variationKey: 'NO_VARIATION',
      itemId: id,
      title,
      condition,
      available: status === 'active' && Number(item['available_quantity'] ?? 0) > 0,
      currency,
      originalPrice: regularPrice.toFixed(2),
      discountedPrice: currentPrice.toFixed(2),
      imageUrl,
      permalink,
      ...(typeof item['user_product_id'] === 'string'
        ? { userProductId: item['user_product_id'] }
        : {}),
    };
  }

  private async isImageAccessible(imageUrl: string): Promise<boolean> {
    try {
      const response = await this.fetchLimited(imageUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(this.config.meliHttpTimeoutMs),
      });
      return response.ok && (response.headers.get('content-type') ?? '').startsWith('image/');
    } catch {
      return false;
    }
  }

  private async getJson(url: string): Promise<unknown> {
    let retriedUnauthorized = false;
    for (let attempt = 0; ; attempt++) {
      const accessToken = await this.getAccessToken();
      try {
        const response = await this.fetchLimited(url, {
          headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
          signal: AbortSignal.timeout(this.config.meliHttpTimeoutMs),
        });
        const text = await response.text();
        if (!response.ok)
          throw new MercadoLivreHttpError(
            response.status,
            text,
            response.headers.get('retry-after') ?? undefined,
          );
        try {
          return JSON.parse(text) as unknown;
        } catch {
          throw new Error('Malformed Mercado Livre JSON response');
        }
      } catch (error) {
        if (
          error instanceof MercadoLivreHttpError &&
          error.status === 401 &&
          !retriedUnauthorized
        ) {
          this.token = undefined;
          retriedUnauthorized = true;
          continue;
        }
        const retryable =
          error instanceof MercadoLivreHttpError
            ? error.status === 429 || error.status === 408 || error.status >= 500
            : true;
        if (!retryable || attempt >= this.config.meliMaxRetries) throw error;
        const retryAfter = this.retryAfterMilliseconds(
          error instanceof MercadoLivreHttpError ? error.retryAfter : undefined,
        );
        const backoff =
          retryAfter ?? Math.min(30_000, 250 * 2 ** attempt + Math.floor(Math.random() * 200));
        await this.sleep(backoff);
      }
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.accessToken;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.meliClientId,
      client_secret: this.config.meliClientSecret,
      refresh_token: this.token?.refreshToken ?? this.config.meliRefreshToken,
    });
    const response = await this.fetchLimited(OAUTH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(this.config.meliHttpTimeoutMs),
    });
    if (!response.ok) throw new Error('Mercado Livre OAuth token refresh failed');
    const payload = (await response.json()) as Record<string, unknown>;
    if (typeof payload['access_token'] !== 'string' || typeof payload['expires_in'] !== 'number')
      throw new Error('Mercado Livre OAuth token response is invalid');
    this.token = {
      accessToken: payload['access_token'],
      expiresAt: Date.now() + payload['expires_in'] * 1000,
      refreshToken:
        typeof payload['refresh_token'] === 'string'
          ? payload['refresh_token']
          : this.config.meliRefreshToken,
    };
    return this.token.accessToken;
  }

  private retryAfterMilliseconds(value?: string): number | undefined {
    if (!value) return undefined;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(value);
    return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
  }

  private async fetchLimited(input: string | URL, init: RequestInit): Promise<Response> {
    if (this.activeRequests >= this.config.meliMaxConcurrency)
      await new Promise<void>((resolve) => this.requestQueue.push(resolve));
    this.activeRequests++;
    try {
      return await this.fetcher(input, init);
    } finally {
      this.activeRequests--;
      this.requestQueue.shift()?.();
    }
  }
}
