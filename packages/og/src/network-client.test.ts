import assert from 'node:assert/strict';
import test from 'node:test';

import { memoryOgObjectClient, ogKvObjectClient, ogStorage } from './index.js';

const liveOptions = readLiveOptions();

test('ogKvObjectClient can round-trip state on the real 0G network when credentials are provided', {
  skip: liveOptions === undefined ? 'Set AGENTIO_0G_* environment variables to run the live 0G KV smoke test.' : false,
}, async () => {
  assert.ok(liveOptions);

  const client = ogKvObjectClient(liveOptions);
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
    AGENTIO_0G_FLOW_CONTRACT: flowContractAddress,
    AGENTIO_0G_STREAM_ID: streamId,
    AGENTIO_0G_NAMESPACE: namespace = `agentio-live-${Date.now()}`,
  } = process.env;

  if (
    evmRpc === undefined ||
    indexerRpc === undefined ||
    kvRpc === undefined ||
    privateKey === undefined ||
    flowContractAddress === undefined ||
    streamId === undefined
  ) {
    return undefined;
  }

  return {
    evmRpc,
    indexerRpc,
    kvRpc,
    privateKey,
    flowContractAddress,
    streamId,
    namespace,
  };
}
