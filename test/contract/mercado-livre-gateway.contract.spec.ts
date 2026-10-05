import { describe, expect, it } from 'vitest';
import {
  mapRankingPayload,
  RankingContractError,
} from '../../src/modules/affiliate-research/infrastructure/mercado-livre/ranking.mapper.js';
import { MercadoLivreApiClient } from '../../src/modules/affiliate-research/infrastructure/mercado-livre/mercado-livre-api.client.js';
import { mapTopLeafCategories } from '../../src/modules/affiliate-research/infrastructure/mercado-livre/category-catalog.mapper.js';

const config = {
  meliClientId: 'client-test',
  meliClientSecret: 'secret-test',
  meliRefreshToken: 'refresh-test',
  meliHttpTimeoutMs: 2000,
  meliMaxRetries: 1,
  meliMaxConcurrency: 2,
};
const jsonResponse = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, ...(headers ? { headers } : {}) });

describe('Mercado Livre ranking contract', () => {
  it('fetches the category dump through the official gateway and applies the requested cap', async () => {
    const requested: string[] = [];
    const client = new MercadoLivreApiClient(config, {
      fetcher: async (input) => {
        const url = String(input);
        requested.push(url);
        if (url.endsWith('/oauth/token'))
          return jsonResponse({ access_token: 'access', expires_in: 3600 });
        if (url.endsWith('/sites/MLB/categories/all'))
          return jsonResponse([
            {
              id: 'MLB1',
              total_items_in_this_category: 200,
              children_categories: [
                { id: 'MLB11', total_items_in_this_category: 8, children_categories: [] },
                { id: 'MLB12', total_items_in_this_category: 25, children_categories: [] },
                { id: 'MLB13', total_items_in_this_category: 18, children_categories: [] },
              ],
            },
          ]);
        if (url.endsWith('/categories/MLB12') || url.endsWith('/categories/MLB13'))
          return jsonResponse({
            id: url.split('/').at(-1),
            site_id: 'MLB',
            children_categories: [],
          });
        return jsonResponse({ message: 'unexpected request' }, 404);
      },
    });

    const categories = await client.discoverLeafCategories(2);
    await client.validateLeafCategories(categories.map(({ categoryId }) => categoryId));

    expect(categories).toEqual([
      { categoryId: 'MLB12', itemCount: 25 },
      { categoryId: 'MLB13', itemCount: 18 },
    ]);
    expect(requested).toContain('https://api.mercadolibre.com/sites/MLB/categories/all');
  });

  it('selects the highest-volume leaf categories from the official category tree', () => {
    const categories = mapTopLeafCategories(
      {
        MLB1: {
          id: 'MLB1',
          total_items_in_this_category: 1000,
          children_categories: [
            { id: 'MLB3', total_items_in_this_category: 20, children_categories: [] },
            { id: 'MLB2', total_items_in_this_category: 50, children_categories: [] },
          ],
        },
      },
      1,
    );
    expect(categories).toEqual([{ categoryId: 'MLB2', itemCount: 50 }]);
  });

  it('breaks equal-volume category ties by ID and rejects malformed catalog entries', () => {
    const categories = mapTopLeafCategories(
      [
        { id: 'MLB2', total_items_in_this_category: 8, children_categories: [] },
        { id: 'MLB1', total_items_in_this_category: 8, children_categories: [] },
      ],
      2,
    );
    expect(categories.map(({ categoryId }) => categoryId)).toEqual(['MLB1', 'MLB2']);
    expect(() => mapTopLeafCategories([{ id: 'MLB3' }], 1)).toThrow('no child list');
  });

  it('never selects more than ten leaf categories', () => {
    const categories = Array.from({ length: 12 }, (_, index) => ({
      id: `MLB${index + 1}`,
      total_items_in_this_category: index + 1,
      children_categories: [],
    }));
    const selected = mapTopLeafCategories(categories, 10);
    expect(selected).toHaveLength(10);
    expect(selected[0]).toEqual({ categoryId: 'MLB12', itemCount: 12 });
    expect(() => mapTopLeafCategories(categories, 11)).toThrow('integer from 1 to 10');
  });

  it('maps typed ranking entries and uses stable list order if position is absent', () => {
    const mapped = mapRankingPayload(
      'MLB1',
      {
        content: [
          { id: 'MLB-1', type: 'ITEM' },
          { id: 'P2', type: 'PRODUCT', position: 2 },
        ],
      },
      new Date(),
    );
    expect(
      mapped.map(({ effectivePosition, reportedPosition }) => [
        effectivePosition,
        reportedPosition,
      ]),
    ).toEqual([
      [1, undefined],
      [2, 2],
    ]);
  });

  it('rejects malformed/partial ranking and duplicate or out-of-range positions', () => {
    expect(() => mapRankingPayload('MLB1', {}, new Date())).toThrow(RankingContractError);
    expect(() =>
      mapRankingPayload(
        'MLB1',
        {
          content: [
            { id: 'x', type: 'ITEM', position: 1 },
            { id: 'y', type: 'ITEM', position: 1 },
          ],
        },
        new Date(),
      ),
    ).toThrow(RankingContractError);
    expect(() =>
      mapRankingPayload('MLB1', { content: Array(21).fill({ id: 'x', type: 'ITEM' }) }, new Date()),
    ).toThrow(RankingContractError);
  });

  it('validates category leaf status using the official API and classifies only documented no-ranking 404', async () => {
    const client = new MercadoLivreApiClient(config, {
      fetcher: async (input) => {
        const url = String(input);
        if (url.endsWith('/oauth/token'))
          return jsonResponse({
            access_token: 'access',
            refresh_token: 'rotated',
            expires_in: 3600,
          });
        if (url.endsWith('/categories/MLB1'))
          return jsonResponse({ id: 'MLB1', site_id: 'MLB', children_categories: [] });
        if (url.endsWith('/categories/MLB2'))
          return jsonResponse({
            id: 'MLB2',
            site_id: 'MLB',
            children_categories: [{ id: 'MLB3' }],
          });
        return jsonResponse({ message: 'Dimension CATEGORY with id MLB1 not found' }, 404);
      },
    });
    await expect(client.validateLeafCategories(['MLB1'])).resolves.toBeUndefined();
    await expect(client.validateLeafCategories(['MLB2'])).rejects.toThrow('not a valid MLB leaf');
    expect((await client.getBestSellerRanking('MLB1')).kind).toBe('NO_RANKING');
  });

  it('respects Retry-After on 429 before retrying', async () => {
    const delays: number[] = [];
    let rankingRequests = 0;
    const client = new MercadoLivreApiClient(config, {
      sleep: async (ms) => {
        delays.push(ms);
      },
      fetcher: async (input) => {
        const url = String(input);
        if (url.endsWith('/oauth/token'))
          return jsonResponse({ access_token: 'access', expires_in: 3600 });
        rankingRequests++;
        if (rankingRequests === 1)
          return jsonResponse({ message: 'limited' }, 429, { 'retry-after': '2' });
        return jsonResponse({ content: [] });
      },
    });
    expect((await client.getBestSellerRanking('MLB1')).kind).toBe('RANKING_AVAILABLE');
    expect(delays).toEqual([2000]);
  });

  it('resolves PRODUCT and USER_PRODUCT only through their documented sale conditions', async () => {
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/oauth/token'))
        return jsonResponse({ access_token: 'access', expires_in: 3600 });
      if (url.endsWith('/products/PR1'))
        return jsonResponse({ id: 'PR1', buy_box_winner: { item_id: 'I1' } });
      if (url.endsWith('/user-products/UP1')) return jsonResponse({ id: 'UP1', user_id: 42 });
      if (url.includes('/users/42/items/search')) return jsonResponse({ results: ['I1'] });
      if (url.endsWith('/I1.jpg') && init?.method === 'HEAD')
        return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } });
      if (url.endsWith('/items/I1'))
        return jsonResponse({
          id: 'I1',
          catalog_product_id: 'PR1',
          user_product_id: 'UP1',
          title: 'Phone',
          condition: 'new',
          status: 'active',
          available_quantity: 3,
          currency_id: 'BRL',
          permalink: 'https://produto.mercadolivre.com.br/I1',
          pictures: [{ secure_url: 'https://img.example/I1.jpg' }],
        });
      if (url.endsWith('/items/I1/prices'))
        return jsonResponse({ prices: [{ type: 'standard', amount: 90, regular_amount: 100 }] });
      throw new Error(`Unexpected request ${url}`);
    };
    const client = new MercadoLivreApiClient(config, { fetcher });
    const product = await client.resolveRankedReferences({
      categoryId: 'MLB1',
      effectivePosition: 1,
      type: 'PRODUCT',
      sourceId: 'PR1',
      observedAt: new Date(),
    });
    expect(product).toMatchObject({
      kind: 'RESOLVED',
      offer: { productId: 'PR1', originalPrice: '100.00', discountedPrice: '90.00' },
    });
    const userProduct = await client.resolveRankedReferences({
      categoryId: 'MLB1',
      effectivePosition: 2,
      type: 'USER_PRODUCT',
      sourceId: 'UP1',
      observedAt: new Date(),
    });
    expect(userProduct).toMatchObject({ kind: 'RESOLVED', offer: { userProductId: 'UP1' } });
  });
});
