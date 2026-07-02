import type { NftSkin, TonNetwork } from '@viberide/shared';
import { z } from 'zod';

import { TonApiError } from './errors';

/** Default TonAPI v2 base URL per network. */
export const TONAPI_BASE_URLS: Readonly<Record<TonNetwork, string>> = {
  mainnet: 'https://tonapi.io',
  testnet: 'https://testnet.tonapi.io',
};

/** The subset of TonAPI's `GET /v2/accounts/{id}/nfts` response the game relies on. */
const nftItemSchema = z.object({
  address: z.string().min(1),
  index: z.number().int().nonnegative(),
  collection: z.object({ address: z.string().min(1) }).optional(),
  metadata: z.object({ name: z.string().optional(), image: z.string().optional() }).optional(),
  previews: z.array(z.object({ resolution: z.string(), url: z.string() })).optional(),
});

const nftItemsResponseSchema = z.object({ nft_items: z.array(nftItemSchema) });

type TonapiNftItem = z.infer<typeof nftItemSchema>;

function toNftSkin(item: TonapiNftItem, fallbackCollectionAddress: string): NftSkin {
  // TonAPI orders previews from smallest to largest resolution.
  const preview = item.previews?.at(-1)?.url;
  return {
    id: item.address,
    name: item.metadata?.name ?? `Skin #${item.index}`,
    imageUrl: item.metadata?.image ?? preview ?? '',
    collectionAddress: item.collection?.address ?? fallbackCollectionAddress,
    itemIndex: item.index,
  };
}

export interface FetchOwnedSkinsOptions {
  readonly ownerAddress: string;
  /**
   * Collection the skins belong to.
   * TODO(manual): pass the real deployed skin collection address here
   * (TonModuleConfig.skinCollectionAddress) once the NFT contract exists.
   */
  readonly collectionAddress: string;
  readonly network: TonNetwork;
  /** Overrides the default TonAPI base URL (e.g. a caching proxy). */
  readonly apiBaseUrl?: string;
  /**
   * TonAPI bearer token — anonymous access is heavily rate limited.
   * TODO(manual): provision a TonAPI key and wire it from an env var
   * (e.g. VITE_TONAPI_KEY) before enabling NFT skins in production.
   */
  readonly apiKey?: string;
  /** Injectable fetch — unit tests stub this and never touch a network. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Looks up the skin NFTs a wallet owns inside one collection via TonAPI.
 * 4xx responses (unknown account, nothing owned) resolve to an empty list;
 * network failures and malformed payloads throw TonApiError.
 */
export async function fetchOwnedSkins(options: FetchOwnedSkinsOptions): Promise<NftSkin[]> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const baseUrl = options.apiBaseUrl ?? TONAPI_BASE_URLS[options.network];
  const url = new URL(`/v2/accounts/${encodeURIComponent(options.ownerAddress)}/nfts`, baseUrl);
  url.searchParams.set('collection', options.collectionAddress);
  url.searchParams.set('limit', '100');
  url.searchParams.set('indirect_ownership', 'false');

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.apiKey !== undefined && options.apiKey !== '') {
    headers.Authorization = `Bearer ${options.apiKey}`;
  }

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), { headers });
  } catch (error) {
    throw new TonApiError('TonAPI request failed', { cause: error });
  }

  if (response.status >= 400 && response.status < 500) {
    // Unknown account or empty collection — "owns nothing", not an error.
    return [];
  }
  if (!response.ok) {
    throw new TonApiError(`TonAPI responded with status ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch (error) {
    throw new TonApiError('TonAPI returned malformed JSON', { cause: error });
  }

  const parsed = nftItemsResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new TonApiError('TonAPI response failed validation', { cause: parsed.error });
  }
  return parsed.data.nft_items.map((item) => toNftSkin(item, options.collectionAddress));
}
