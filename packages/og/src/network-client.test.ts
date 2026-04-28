import assert from 'node:assert/strict';
import test from 'node:test';

import { loadEnvFile } from './env.js';
import { memoryOgObjectClient, ogKvObjectClient, ogStorage, supportsDurableOgState } from './index.js';

loadEnvFile();
const liveOptions = process.env.AGENTIO_0G_RUN_LIVE === '1' && process.env.AGENTIO_0G_SKIP_LIVE !== '1'
  ? readLiveOptions()
  : { ready: false as const, reason: 'Set AGENTIO_0G_RUN_LIVE=1 to run the live 0G KV smoke test.' };

test('ogKvObjectClient can round-trip state on the real 0G network when credentials are provided', {
  skip: liveOptions.ready ? false : liveOptions.reason,
}, async () => {
  assert.ok(liveOptions.ready);

  const client = ogKvObjectClient(liveOptions);

  assert.deepEqual(client.capabilities, ['object-write', 'object-read', 'durable-key-read', 'audit-append']);
  assert.equal(supportsDurableOgState(client), true);

  const storage = ogStorage({ namespace: liveOptions.namespace, client });
  const identity = { id: `agent-live-${Date.now()}`, publicKey: 'agent-live-public-key' };
  const state = { cumulativeSpend: 7n, updatedAt: new Date('2026-04-25T12:00:00.000Z') };

  await storage.saveState(identity, state);

  assert.deepEqual(await storage.loadState(identity), state);
});

test('live 0G smoke test shape can be exercised locally through the memory client', async () => {
  const storage = ogStorage({ namespace: 'agentio-live-test-shape', client: memoryOgObjectClient() });
  const identity = { id: 'agent-local-shape', publicKey: 'agent-local-public-key' };
  const state = { cumulativeSpend: 3n, updatedAt: new Date('2026-04-25T12:00:00.000Z') };

  await storage.saveState(identity, state);

  assert.deepEqual(await storage.loadState(identity), state);
});

function readLiveOptions() {
  const {
    AGENTIO_0G_EVM_RPC: evmRpc,
    AGENTIO_0G_INDEXER_RPC: indexerRpc,
    AGENTIO_0G_KV_RPC: kvRpc,
    AGENTIO_0G_PRIVATE_KEY: privateKey,
    AGENTIO_0G_STREAM_ID: streamId,
    AGENTIO_0G_NAMESPACE: namespace = `agentio-live-${Date.now()}`,
    AGENTIO_0G_LOG_SYNC_TIMEOUT_MS: logSyncTimeoutMs = '30000',
    AGENTIO_0G_KV_RPC_DISCOVERY_TIMEOUT_MS: kvRpcDiscoveryTimeoutMs = '3000',
    AGENTIO_0G_KV_READ_RETRY_TIMEOUT_MS: readRetryTimeoutMs = '15000',
  } = process.env;

  const missing = [
    ['AGENTIO_0G_EVM_RPC', evmRpc],
    ['AGENTIO_0G_INDEXER_RPC', indexerRpc],
    ['AGENTIO_0G_KV_RPC', kvRpc],
    ['AGENTIO_0G_PRIVATE_KEY', privateKey],
    ['AGENTIO_0G_STREAM_ID', streamId],
  ]
    .filter(([, value]) => value === undefined || value === '')
    .map(([key]) => key);

  if (missing.length > 0) {
    return { ready: false as const, reason: `Set ${missing.join(', ')} to run the live 0G KV smoke test.` };
  }

  if (
    evmRpc === undefined ||
    indexerRpc === undefined ||
    kvRpc === undefined ||
    privateKey === undefined ||
    streamId === undefined
  ) {
    return { ready: false as const, reason: 'Set all AGENTIO_0G_* variables to run the live 0G KV smoke test.' };
  }

  if (!isPrivateKey(privateKey)) {
    return { ready: false as const, reason: 'AGENTIO_0G_PRIVATE_KEY must be a 0x-prefixed 32-byte private key.' };
  }

  if (!isBytes32(streamId)) {
    return { ready: false as const, reason: 'AGENTIO_0G_STREAM_ID must be a 0x-prefixed 32-byte hex value.' };
  }

  return {
    ready: true as const,
    evmRpc,
    indexerRpc,
    kvRpc,
    privateKey,
    streamId,
    namespace,
    logSyncTimeoutMs: parsePositiveInteger(logSyncTimeoutMs, 30_000),
    kvRpcDiscoveryTimeoutMs: parsePositiveInteger(kvRpcDiscoveryTimeoutMs, 3_000),
    readRetryTimeoutMs: parsePositiveInteger(readRetryTimeoutMs, 15_000),
    onProgress(message: string) {
      console.log(`[0G] ${message}`);
    },
  };
}

function isPrivateKey(value: string | undefined): value is string {
  return /^0x[0-9a-fA-F]{64}$/.test(value ?? '');
}

function isBytes32(value: string | undefined): value is string {
  return /^0x[0-9a-fA-F]{64}$/.test(value ?? '');
}

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
