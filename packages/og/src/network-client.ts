import { Batcher, Indexer, KvClient, getFlowContract } from '@0glabs/0g-ts-sdk';
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
  /** 0G KV RPC used to read values back by stream id and key. */
  readonly kvRpc: string;
  /** Private key for the funded writer account that submits KV writes. */
  readonly privateKey: string;
  /** Existing 0G KV stream id that owns this app's key/value records. */
  readonly streamId: string;
  /** Number of storage replicas requested for writes. Defaults to 1 for tests. */
  readonly expectedReplica?: number;
  /** 0G KV stream version. Defaults to 1, matching the official examples. */
  readonly version?: number;
};

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
  const kv = new KvClient(options.kvRpc);

  return {
    async getObject(key: string): Promise<string | undefined> {
      const value = await kv.getValue(options.streamId, encodeKey(key), version);
      if (value === null) {
        return undefined;
      }

      return Buffer.from(value.data, 'base64').toString('utf8');
    },

    async putObject(key: string, value: string): Promise<OgPutObjectResult> {
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

      const [result, uploadError] = await batcher.exec();
      if (uploadError !== null) {
        throw new Error(`0G KV write failed: ${uploadError.message}`);
      }

      return { reference: `0g-kv:${result.txHash}:${result.rootHash}` };
    },
  };
}

function encodeKey(key: string): Uint8Array {
  return Buffer.from(key, 'utf8');
}
