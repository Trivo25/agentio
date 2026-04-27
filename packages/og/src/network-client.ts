import { Batcher, Indexer, KvClient, MemData, getFlowContract } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';

import type { OgObjectClient, OgPutObjectResult } from './index.js';

/**
 * Configuration for the live 0G KV-backed object client.
 *
 * Maps the SDK's simple `getObject`/`putObject` storage contract onto
 * 0G KV so agent
 * state can be addressed by stable logical keys such as
 * `agents/{agentId}/state/latest` instead of by one-off file root hashes.
 */
export type OgKvObjectClientOptions = {
  /** 0G EVM RPC used by the official SDK for transactions. */
  readonly evmRpc: string;
  /** 0G Storage indexer RPC used to select storage nodes for writes. */
  readonly indexerRpc: string;
  /** Optional 0G KV RPC used to read values back by stream id and key. */
  readonly kvRpc?: string;
  /** Private key for the funded writer account that submits KV writes. */
  readonly privateKey: string;
  /** Existing 0G KV stream id that owns this app's key/value records. */
  readonly streamId: string;
  /** Number of storage replicas requested for writes. Defaults to 1 for tests. */
  readonly expectedReplica?: number;
  /**
   * Controls whether writes wait for storage finality before returning.
   *
   * The default is `false` so smoke tests and local development verify that a
   * write was accepted without blocking on slower testnet finality. Set this to
   * `true` when an application must know the data is fully finalized before it
   * continues.
   */
  readonly finalityRequired?: boolean;
  /**
   * Optional upload fee override passed through to the 0G SDK.
   *
   * Most applications should leave this unset and let the SDK estimate the
   * required fee from the selected storage nodes.
   */
  readonly fee?: bigint;
  /**
   * Maximum time to wait for the selected storage node to observe the upload.
   *
   * Use this for live smoke tests and user-facing flows that should fail with
   * a clear error instead of waiting indefinitely when a testnet node is behind.
   * Leave it unset for long-running jobs that can tolerate waiting.
   */
  readonly logSyncTimeoutMs?: number;
  /**
   * Receives progress messages emitted by the 0G SDK while an upload is being
   * submitted, synced, and replicated.
   *
   * Applications can use this to surface network progress to users or test
   * logs instead of treating a long-running upload as a silent hang.
   */
  readonly onProgress?: (message: string) => void;
  /**
   * Maximum time to spend probing each discovered KV endpoint candidate.
   *
   * The indexer currently exposes storage node URLs, not a dedicated KV URL.
   * The client uses this timeout while checking derived KV endpoints so a
   * missing or firewalled KV service does not make reads appear to hang.
   */
  readonly kvRpcDiscoveryTimeoutMs?: number;
  /** 0G KV stream version. Defaults to 1, matching the official examples. */
  readonly version?: number;
};


/** Configuration for live 0G file/object uploads. */
export type OgFileObjectClientOptions = {
  /** 0G EVM RPC used by the official SDK for upload transactions. */
  readonly evmRpc: string;
  /** 0G Storage indexer RPC used for upload and download routing. */
  readonly indexerRpc: string;
  /** Private key for the funded writer account that submits uploads. */
  readonly privateKey: string;
  /**
   * Controls whether uploads wait for storage finality before returning.
   *
   * The default is `false` to keep live smoke checks responsive on testnet.
   * Enable it when the caller needs stronger confirmation before moving on.
   */
  readonly finalityRequired?: boolean;
  /**
   * Optional upload fee override passed through to the 0G SDK.
   *
   * Leave this unset unless the application has already computed the fee it
   * wants the underlying 0G transaction to use.
   */
  readonly fee?: bigint;
  /**
   * Maximum time to wait for the selected storage node to observe the upload.
   *
   * This gives callers a bounded failure mode when the network accepts the
   * transaction but the storage node lags behind while syncing logs.
   */
  readonly logSyncTimeoutMs?: number;
  /**
   * Receives progress messages emitted by the 0G SDK while an upload is being
   * submitted, synced, and replicated.
   *
   * This is useful for CLIs, tests, and demos that should show why a network
   * operation is still running.
   */
  readonly onProgress?: (message: string) => void;
};

/**
 * Creates an object client backed by 0G file uploads.
 *
 * This client is useful for immutable blobs because each write returns a root
 * hash reference. It keeps an in-memory key-to-root index for the current
 * process, so use 0G KV when you need durable lookups by logical key.
 */
export function ogFileObjectClient(options: OgFileObjectClientOptions): OgObjectClient {
  const provider = new ethers.JsonRpcProvider(options.evmRpc);
  const signer = new ethers.Wallet(options.privateKey, provider);
  const indexer = new Indexer(options.indexerRpc);
  const roots = new Map<string, string>();

  return {
    async getObject(key: string): Promise<string | undefined> {
      const rootHash = roots.get(key);
      if (rootHash === undefined) {
        return undefined;
      }

      throw new Error(`0G file object ${rootHash} is stored remotely, but in-memory download decoding is not implemented yet.`);
    },

    async putObject(key: string, value: string): Promise<OgPutObjectResult> {
      const data = new MemData(Buffer.from(value, 'utf8'));
      const [result, uploadError] = await indexer.upload(
        data,
        options.evmRpc,
        signer as unknown as Parameters<Indexer['upload']>[2],
        uploadOptions(options),
      );
      if (uploadError !== null) {
        throw new Error(`0G file upload failed: ${uploadError.message}`);
      }

      const rootHash = 'rootHash' in result ? result.rootHash : result.rootHashes[0];
      const txHash = 'txHash' in result ? result.txHash : result.txHashes[0];
      if (rootHash === undefined || txHash === undefined) {
        throw new Error('0G file upload did not return a root hash.');
      }

      roots.set(key, rootHash);
      return { reference: `0g-file:${txHash}:${rootHash}` };
    },
  };
}

/**
 * Creates an object client backed by live 0G KV operations.
 *
 * Use this only in credential-gated tests or applications that intentionally
 * write to 0G. Local tests should keep using `memoryOgObjectClient()` so the
 * default suite stays fast, deterministic, and free of network side effects.
 */
export function ogKvObjectClient(options: OgKvObjectClientOptions): OgObjectClient {
  const version = options.version ?? 1;
  const expectedReplica = options.expectedReplica ?? 1;
  const provider = new ethers.JsonRpcProvider(options.evmRpc);
  const signer = new ethers.Wallet(options.privateKey, provider);
  const indexer = new Indexer(options.indexerRpc);
  let kvClient: Promise<KvClient> | undefined;

  const getKvClient = () => {
    kvClient ??= createKvClient(options, expectedReplica);
    return kvClient;
  };

  return {
    async getObject(key: string): Promise<string | undefined> {
      const kv = await getKvClient();
      const value = await readKvValue(kv, options.streamId, encodeKey(key), version);
      if (value === null) {
        return undefined;
      }

      return Buffer.from(value.data, 'base64').toString('utf8');
    },

    async putObject(key: string, value: string): Promise<OgPutObjectResult> {
      await getKvClient();

      const [nodes, selectError] = await indexer.selectNodes(expectedReplica);
      if (selectError !== null) {
        throw new Error(`0G node selection failed: ${selectError.message}`);
      }

      const status = await nodes[0]?.getStatus();
      const flowAddress = status?.networkIdentity.flowAddress;
      if (flowAddress === undefined) {
        throw new Error('0G node status did not include a flow contract address.');
      }

      const flow = getFlowContract(flowAddress, signer as unknown as Parameters<typeof getFlowContract>[1]);
      const batcher = new Batcher(version, nodes, flow, options.evmRpc);
      batcher.streamDataBuilder.set(options.streamId, encodeKey(key), Buffer.from(value, 'utf8'));

      const [result, uploadError] = await batcher.exec(uploadOptions(options));
      if (uploadError !== null) {
        throw new Error(`0G KV write failed: ${uploadError.message}`);
      }

      return { reference: `0g-kv:${result.txHash}:${result.rootHash}` };
    },
  };
}


async function createKvClient(options: OgKvObjectClientOptions, expectedReplica: number): Promise<KvClient> {
  if (options.kvRpc !== undefined && options.kvRpc !== '') {
    return new KvClient(options.kvRpc);
  }

  return new KvClient(await discoverKvRpc(options, expectedReplica));
}

async function readKvValue(kv: KvClient, streamId: string, key: Uint8Array, version: number) {
  try {
    return await kv.getValue(streamId, key, version);
  } catch (error) {
    if (isJsonRpcMethodNotFound(error)) {
      throw new Error(
        '0G KV read failed because the configured endpoint does not expose KV RPC methods. ' +
        'Set kvRpc/AGENTIO_0G_KV_RPC to a real 0G KV node; storage-node URLs selected by the indexer may not support kv_getValue.',
      );
    }

    throw error;
  }
}

function isJsonRpcMethodNotFound(error: unknown): boolean {
  return error instanceof Error && (error.message === 'Method not found' || ('code' in error && error.code === -32601));
}

type DiscoveredNode = {
  readonly url: string;
};

type ShardedNodeResponse = {
  readonly trusted?: readonly DiscoveredNode[];
  readonly discovered?: readonly DiscoveredNode[] | null;
};

async function discoverKvRpc(options: OgKvObjectClientOptions, expectedReplica: number): Promise<string> {
  const timeoutMs = options.kvRpcDiscoveryTimeoutMs ?? 3_000;
  const indexer = new Indexer(options.indexerRpc);
  const shardedNodes = await indexer.getShardedNodes() as ShardedNodeResponse;
  const nodes = [...(shardedNodes.trusted ?? []), ...(shardedNodes.discovered ?? [])];
  const candidates = unique(nodes.flatMap((node) => kvRpcCandidates(node.url)));

  if (candidates.length === 0) {
    throw new Error('0G indexer did not return storage nodes that can be probed for KV RPC.');
  }

  options.onProgress?.(`Probing ${candidates.length} discovered 0G KV endpoint candidate(s)...`);

  const probes = await Promise.all(candidates.map(async (candidate) => ({
    candidate,
    ok: await supportsKvRpc(candidate, timeoutMs),
  })));
  const selected = probes.find((probe) => probe.ok)?.candidate;
  if (selected !== undefined) {
    options.onProgress?.(`Discovered 0G KV endpoint: ${selected}`);
    return selected;
  }

  throw new Error(
    `Could not discover a 0G KV RPC endpoint from ${nodes.length} indexer node(s) for replica target ${expectedReplica}. ` +
    'The indexer exposes storage RPC URLs, but none of the derived KV candidates responded to KV methods. ' +
    'Check whether the current testnet exposes KV on a different port or behind a separate service.',
  );
}

function kvRpcCandidates(storageUrl: string): string[] {
  const withKvPort = replaceUrlPort(storageUrl, '6789');
  return withKvPort === storageUrl ? [storageUrl] : [withKvPort, storageUrl];
}

function replaceUrlPort(url: string, port: string): string {
  try {
    const parsed = new URL(url);
    parsed.port = port;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

async function supportsKvRpc(url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'kv_getHoldingStreamIds', params: [] }),
      signal: controller.signal,
    });

    const payload = await response.json() as { readonly error?: { readonly code?: number } };
    return payload.error?.code !== -32601;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function uploadOptions(options: {
  readonly finalityRequired?: boolean;
  readonly fee?: bigint;
  readonly logSyncTimeoutMs?: number;
  readonly onProgress?: (message: string) => void;
}) {
  const startedAt = Date.now();

  return {
    finalityRequired: options.finalityRequired ?? false,
    fee: options.fee,
    onProgress(message: string) {
      options.onProgress?.(message);
      if (options.logSyncTimeoutMs !== undefined && Date.now() - startedAt > options.logSyncTimeoutMs) {
        throw new Error(`0G upload did not sync within ${options.logSyncTimeoutMs}ms. Last progress: ${message}`);
      }
    },
  };
}

function encodeKey(key: string): Uint8Array {
  return Buffer.from(key, 'utf8');
}
