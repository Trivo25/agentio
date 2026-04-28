import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { startLocalAxlNetwork } from './index.js';

const axlBinary = process.env.AGENTIO_AXL_NODE_BINARY;
const runLocalSmoke = process.env.AGENTIO_AXL_RUN_LOCAL === '1' && axlBinary !== undefined && axlBinary !== '';

test(
  'startLocalAxlNetwork can start two real AXL nodes when a binary is provided',
  { skip: runLocalSmoke ? false : 'Set AGENTIO_AXL_RUN_LOCAL=1 and AGENTIO_AXL_NODE_BINARY to run the local AXL smoke test.' },
  async () => {
    assert.ok(axlBinary);
    const directory = await mkdtemp(join(tmpdir(), 'agentio-axl-smoke-'));
    const network = await startLocalAxlNetwork({
      binaryPath: axlBinary,
      workingDirectory: directory,
      startupTimeoutMs: Number(process.env.AGENTIO_AXL_STARTUP_TIMEOUT_MS ?? 15_000),
      nodes: [
        {
          name: 'alice',
          apiPort: Number(process.env.AGENTIO_AXL_ALICE_API_PORT ?? 19101),
          listen: [`tls://127.0.0.1:${Number(process.env.AGENTIO_AXL_ALICE_LISTEN_PORT ?? 19201)}`],
        },
        {
          name: 'bob',
          apiPort: Number(process.env.AGENTIO_AXL_BOB_API_PORT ?? 19102),
          peers: [`tls://127.0.0.1:${Number(process.env.AGENTIO_AXL_ALICE_LISTEN_PORT ?? 19201)}`],
        },
      ],
    });

    try {
      const alice = network.node('alice');
      const bob = network.node('bob');

      assert.match(alice.peerId, /^[0-9a-fA-F]+$/);
      assert.match(bob.peerId, /^[0-9a-fA-F]+$/);
      assert.notEqual(alice.peerId, bob.peerId);
      assert.equal(alice.baseUrl, `http://127.0.0.1:${Number(process.env.AGENTIO_AXL_ALICE_API_PORT ?? 19101)}`);
      assert.equal(bob.baseUrl, `http://127.0.0.1:${Number(process.env.AGENTIO_AXL_BOB_API_PORT ?? 19102)}`);

      const body = new TextEncoder().encode('hello bob from local smoke');
      await alice.client.send({ peerId: bob.peerId, body });

      const received = await pollForMessage(bob.client.recv, 5_000);
      assert.ok(received, 'Bob should receive Alice\'s message.');
      assert.match(received.fromPeerId, /^[0-9a-fA-F]{64}$/);
      assert.equal(new TextDecoder().decode(received.body), 'hello bob from local smoke');
    } finally {
      await network.stop();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

async function pollForMessage<T>(recv: () => Promise<T | undefined>, timeoutMs: number): Promise<T | undefined> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const message = await recv();
    if (message !== undefined) {
      return message;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return undefined;
}
