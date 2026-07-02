import { Address } from '@ton/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TonApiError } from './errors';
import { fetchOwnedSkins, TONAPI_BASE_URLS } from './nft-indexer';

const owner = Address.parseRaw(`0:${'33'.repeat(32)}`).toString({ testOnly: true });
const collection = Address.parseRaw(`0:${'44'.repeat(32)}`).toString({ testOnly: true });

const baseOptions = {
  ownerAddress: owner,
  collectionAddress: collection,
  network: 'testnet',
} as const;

interface RecordedCall {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function createFetchStub(respond: (url: string) => Response): {
  fetchImpl: typeof fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = toUrlString(input);
    calls.push({ url, init });
    return Promise.resolve(respond(url));
  };
  return { fetchImpl, calls };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

const tonapiPayload = {
  nft_items: [
    {
      address: '0:item-one',
      index: 3,
      collection: { address: collection },
      metadata: { name: 'Neon Rider', image: 'https://img.example/neon.png' },
      previews: [
        { resolution: '5x5', url: 'https://img.example/neon-5.png' },
        { resolution: '1500x1500', url: 'https://img.example/neon-1500.png' },
      ],
    },
    {
      address: '0:item-two',
      index: 7,
      previews: [
        { resolution: '100x100', url: 'https://img.example/two-100.png' },
        { resolution: '500x500', url: 'https://img.example/two-500.png' },
      ],
    },
    {
      address: '0:item-three',
      index: 9,
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchOwnedSkins', () => {
  it('maps TonAPI items to NftSkin with sensible fallbacks', async () => {
    const { fetchImpl } = createFetchStub(() => jsonResponse(tonapiPayload));
    const skins = await fetchOwnedSkins({ ...baseOptions, fetchImpl });

    expect(skins).toEqual([
      {
        id: '0:item-one',
        name: 'Neon Rider',
        imageUrl: 'https://img.example/neon.png',
        collectionAddress: collection,
        itemIndex: 3,
      },
      {
        id: '0:item-two',
        name: 'Skin #7',
        imageUrl: 'https://img.example/two-500.png',
        collectionAddress: collection,
        itemIndex: 7,
      },
      {
        id: '0:item-three',
        name: 'Skin #9',
        imageUrl: '',
        collectionAddress: collection,
        itemIndex: 9,
      },
    ]);
  });

  it('requests the testnet TonAPI endpoint with collection filtering', async () => {
    const { fetchImpl, calls } = createFetchStub(() => jsonResponse({ nft_items: [] }));
    await fetchOwnedSkins({ ...baseOptions, fetchImpl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(url.origin).toBe(TONAPI_BASE_URLS.testnet);
    expect(url.pathname).toBe(`/v2/accounts/${encodeURIComponent(owner)}/nfts`);
    expect(url.searchParams.get('collection')).toBe(collection);
    expect(url.searchParams.get('limit')).toBe('100');
    expect(url.searchParams.get('indirect_ownership')).toBe('false');
    expect(calls[0]!.init?.headers).toEqual({ Accept: 'application/json' });
  });

  it('uses the mainnet base URL for the mainnet network', async () => {
    const { fetchImpl, calls } = createFetchStub(() => jsonResponse({ nft_items: [] }));
    await fetchOwnedSkins({ ...baseOptions, network: 'mainnet', fetchImpl });
    expect(new URL(calls[0]!.url).origin).toBe(TONAPI_BASE_URLS.mainnet);
  });

  it('honours an apiBaseUrl override', async () => {
    const { fetchImpl, calls } = createFetchStub(() => jsonResponse({ nft_items: [] }));
    await fetchOwnedSkins({ ...baseOptions, apiBaseUrl: 'https://proxy.example.com', fetchImpl });
    expect(new URL(calls[0]!.url).origin).toBe('https://proxy.example.com');
  });

  it('sends the TonAPI key as a bearer token when provided', async () => {
    const { fetchImpl, calls } = createFetchStub(() => jsonResponse({ nft_items: [] }));
    await fetchOwnedSkins({ ...baseOptions, apiKey: 'test-key', fetchImpl });
    expect(calls[0]!.init?.headers).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer test-key',
    });
  });

  it('resolves to an empty list on 4xx responses', async () => {
    const notFound = createFetchStub(() => jsonResponse({ error: 'not found' }, 404));
    await expect(
      fetchOwnedSkins({ ...baseOptions, fetchImpl: notFound.fetchImpl }),
    ).resolves.toEqual([]);

    const badRequest = createFetchStub(() => jsonResponse({ error: 'bad' }, 400));
    await expect(
      fetchOwnedSkins({ ...baseOptions, fetchImpl: badRequest.fetchImpl }),
    ).resolves.toEqual([]);
  });

  it('throws TonApiError on 5xx responses', async () => {
    const { fetchImpl } = createFetchStub(() => jsonResponse({ error: 'oops' }, 502));
    await expect(fetchOwnedSkins({ ...baseOptions, fetchImpl })).rejects.toBeInstanceOf(
      TonApiError,
    );
    await expect(fetchOwnedSkins({ ...baseOptions, fetchImpl })).rejects.toThrow('status 502');
  });

  it('throws TonApiError on malformed JSON', async () => {
    const { fetchImpl } = createFetchStub(() => new Response('not-json{{{', { status: 200 }));
    await expect(fetchOwnedSkins({ ...baseOptions, fetchImpl })).rejects.toBeInstanceOf(
      TonApiError,
    );
    await expect(fetchOwnedSkins({ ...baseOptions, fetchImpl })).rejects.toThrow('malformed JSON');
  });

  it('throws TonApiError when the payload fails schema validation', async () => {
    const { fetchImpl } = createFetchStub(() => jsonResponse({ nft_items: 'nope' }));
    const caught: unknown = await fetchOwnedSkins({ ...baseOptions, fetchImpl }).catch(
      (error: unknown) => error,
    );
    expect(caught).toBeInstanceOf(TonApiError);
    expect((caught as TonApiError).message).toBe('TonAPI response failed validation');
    expect((caught as TonApiError).cause).toBeDefined();
  });

  it('throws TonApiError with the cause on network failure', async () => {
    const networkError = new TypeError('fetch failed');
    const fetchImpl: typeof fetch = () => Promise.reject(networkError);
    const caught: unknown = await fetchOwnedSkins({ ...baseOptions, fetchImpl }).catch(
      (error: unknown) => error,
    );
    expect(caught).toBeInstanceOf(TonApiError);
    expect((caught as TonApiError).code).toBe('TON_API_ERROR');
    expect((caught as TonApiError).cause).toBe(networkError);
  });

  it('falls back to globalThis.fetch when no fetchImpl is provided', async () => {
    const stub = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(jsonResponse({ nft_items: [] })),
    );
    vi.stubGlobal('fetch', stub);

    await expect(fetchOwnedSkins({ ...baseOptions })).resolves.toEqual([]);
    expect(stub).toHaveBeenCalledOnce();
    const firstArg = stub.mock.calls[0]![0];
    expect(typeof firstArg).toBe('string');
    expect(firstArg).toContain(TONAPI_BASE_URLS.testnet);
  });
});
