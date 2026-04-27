import assert from 'node:assert/strict';
import test from 'node:test';

import { loadEnvFile } from './env.js';
import { ogFileObjectClient } from './index.js';

loadEnvFile();
const liveOptions = process.env.AGENTIO_0G_RUN_LIVE === '1' && process.env.AGENTIO_0G_SKIP_LIVE !== '1'
  ? readLiveOptions()
  : { ready: false as const, reason: 'Set AGENTIO_0G_RUN_LIVE=1 to run the live 0G file smoke test.' };

test('ogFileObjectClient can upload an immutable object on the real 0G network when credentials are provided', {
  skip: liveOptions.ready ? false : liveOptions.reason,
}, async () => {
  assert.ok(liveOptions.ready);

  const client = ogFileObjectClient(liveOptions);
  const result = await client.putObject(`agentio-file-smoke-${Date.now()}`, 'hello 0G from agentio');

  assert.match(result.reference ?? '', /^0g-file:0x[0-9a-fA-F]+:0x[0-9a-fA-F]{64}$/);
});

function readLiveOptions() {
  const {
    AGENTIO_0G_EVM_RPC: evmRpc,
    AGENTIO_0G_INDEXER_RPC: indexerRpc,
    AGENTIO_0G_PRIVATE_KEY: privateKey,
  } = process.env;

  const missing = [
    ['AGENTIO_0G_EVM_RPC', evmRpc],
    ['AGENTIO_0G_INDEXER_RPC', indexerRpc],
    ['AGENTIO_0G_PRIVATE_KEY', privateKey],
  ]
    .filter(([, value]) => value === undefined || value === '')
    .map(([key]) => key);

  if (missing.length > 0) {
    return { ready: false as const, reason: `Set ${missing.join(', ')} to run the live 0G file smoke test.` };
  }

  if (evmRpc === undefined || indexerRpc === undefined || privateKey === undefined) {
    return { ready: false as const, reason: 'Set all required AGENTIO_0G_* variables to run the live 0G file smoke test.' };
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    return { ready: false as const, reason: 'AGENTIO_0G_PRIVATE_KEY must be a 0x-prefixed 32-byte private key.' };
  }

  return { ready: true as const, evmRpc, indexerRpc, privateKey };
}
