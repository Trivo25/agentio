import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { startLocalAxlNetwork } from '@0xagentio/axl-local';

const binaryPath = process.env.AGENTIO_AXL_NODE_BINARY;
if (binaryPath === undefined || binaryPath === '') {
  throw new Error(
    'Set AGENTIO_AXL_NODE_BINARY to the compiled Gensyn AXL node binary.',
  );
}

const aliceApiPort = Number(process.env.AGENTIO_AXL_ALICE_API_PORT ?? 19101);
const aliceListenPort = Number(
  process.env.AGENTIO_AXL_ALICE_LISTEN_PORT ?? 19201,
);
const bobApiPort = Number(process.env.AGENTIO_AXL_BOB_API_PORT ?? 19102);
const directory = await mkdtemp(join(tmpdir(), 'agentio-axl-example-'));

console.log('Starting local AXL network...');
const network = await startLocalAxlNetwork({
  binaryPath,
  workingDirectory: directory,
  nodes: [
    {
      name: 'alice',
      apiPort: aliceApiPort,
      listen: [`tls://127.0.0.1:${aliceListenPort}`],
    },
    {
      name: 'bob',
      apiPort: bobApiPort,
      peers: [`tls://127.0.0.1:${aliceListenPort}`],
    },
  ],
});

try {
  const alice = network.node('alice');
  const bob = network.node('bob');

  console.log(`Alice peer id: ${alice.peerId}`);
  console.log(`Bob peer id: ${bob.peerId}`);

  const body = new TextEncoder().encode('hello bob, from alice over AXL');
  console.log('Alice sends one binary message to Bob...');
  await alice.client.send({ peerId: bob.peerId, body });

  console.log('Bob polls for one inbound message...');
  const received = await pollForMessage(bob.client.recv, 5_000);
  if (received === undefined) {
    throw new Error('Bob did not receive a message before timeout.');
  }

  console.log(`Bob received from: ${received.fromPeerId}`);
  console.log(`Bob received body: ${new TextDecoder().decode(received.body)}`);
} finally {
  console.log('Stopping local AXL network...');
  await network.stop();
  await rm(directory, { recursive: true, force: true });
}

async function pollForMessage<T>(
  recv: () => Promise<T | undefined>,
  timeoutMs: number,
): Promise<T | undefined> {
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
