import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { startLocalAxlNetwork } from '@0xagentio/axl-local';
import {
  axlTransport,
  createAgentIdentity,
  createAgentMessage,
  createAgentPeer,
  createAgentReply,
} from '@0xagentio/sdk';

const binaryPath = process.env.AGENTIO_AXL_NODE_BINARY;
if (binaryPath === undefined || binaryPath === '') {
  throw new Error('Set AGENTIO_AXL_NODE_BINARY to the compiled Gensyn AXL node binary.');
}

const aliceApiPort = Number(process.env.AGENTIO_AXL_ALICE_API_PORT ?? 19101);
const aliceListenPort = Number(process.env.AGENTIO_AXL_ALICE_LISTEN_PORT ?? 19201);
const bobApiPort = Number(process.env.AGENTIO_AXL_BOB_API_PORT ?? 19102);
const directory = await mkdtemp(join(tmpdir(), 'agentio-real-axl-peer-'));

console.log('Starting two local AXL nodes for AgentIO peers...');
const network = await startLocalAxlNetwork({
  binaryPath,
  workingDirectory: directory,
  startupTimeoutMs: Number(process.env.AGENTIO_AXL_STARTUP_TIMEOUT_MS ?? 15_000),
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

const aliceTransport = axlTransport({ client: network.node('alice').client, pollIntervalMs: 100 });
const bobTransport = axlTransport({ client: network.node('bob').client, pollIntervalMs: 100 });

try {
  const aliceIdentity = createAgentIdentity({
    id: network.node('alice').peerId,
    publicKey: network.node('alice').peerId,
  });
  const bobIdentity = createAgentIdentity({
    id: network.node('bob').peerId,
    publicKey: network.node('bob').peerId,
  });

  const alice = createAgentPeer({ identity: aliceIdentity, transport: aliceTransport });
  const bob = createAgentPeer({ identity: bobIdentity, transport: bobTransport });

  console.log(`Alice AgentIO peer id: ${alice.identity.id}`);
  console.log(`Bob AgentIO peer id: ${bob.identity.id}`);

  bob.onMessage(async (message) => {
    console.log(`Bob received ${message.type} from Alice over AXL.`);
    await bob.send(
      message.sender,
      createAgentReply({
        id: 'quote-reply-1',
        type: 'quote.reply',
        sender: bob.identity.id,
        createdAt: new Date(),
        request: { ...message, id: message.id ?? 'missing-id' },
        payload: {
          accepted: true,
          price: '1 ETH = 3000 USDC',
        },
      }),
    );
  });

  console.log('Alice asks Bob for a quote through the real AXL transport...');
  const reply = await alice.request(
    bob.identity.id,
    createAgentMessage({
      id: 'quote-request-1',
      type: 'quote.request',
      sender: alice.identity.id,
      correlationId: 'quote-flow-1',
      createdAt: new Date(),
      payload: {
        tokenIn: 'ETH',
        tokenOut: 'USDC',
        amount: '1',
      },
    }),
    { expectedType: 'quote.reply', timeoutMs: 10_000 },
  );

  console.log(`Alice received ${reply.type}: ${String(reply.payload.price)}`);
} finally {
  aliceTransport.stop();
  bobTransport.stop();
  await network.stop();
  await rm(directory, { recursive: true, force: true });
  console.log('Stopped local AXL AgentIO example.');
}
