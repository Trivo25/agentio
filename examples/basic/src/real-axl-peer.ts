import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { startLocalAxlNetwork } from '@0xagentio/axl-local';
import { noirProofs } from '@0xagentio/noir';
import {
  axlTransport,
  encodeAgentMessage,
  createActionIntent,
  createAgentIdentity,
  createAgentPeer,
  createAgentReply,
  createPolicy,
  createProofBackedMessage,
  hashPolicy,
  issueLocalCredential,
  localDelegationSigner,
  verifyMessageAction,
} from '@0xagentio/sdk';
import { toJsonSafe } from './json.js';

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
const directory = await mkdtemp(join(tmpdir(), 'agentio-real-axl-peer-'));
const now = new Date('2026-04-28T12:00:00.000Z');

console.log('Starting two local AXL nodes for AgentIO peers...');
const network = await startLocalAxlNetwork({
  binaryPath,
  workingDirectory: directory,
  startupTimeoutMs: Number(
    process.env.AGENTIO_AXL_STARTUP_TIMEOUT_MS ?? 15_000,
  ),
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

const aliceTransport = axlTransport({
  client: network.node('alice').client,
  pollIntervalMs: 100,
  onError: (error) => console.error('Alice AXL transport error:', error),
});
const bobTransport = axlTransport({
  client: network.node('bob').client,
  pollIntervalMs: 100,
  onError: (error) => console.error('Bob AXL transport error:', error),
});

try {
  const aliceIdentity = createAgentIdentity({
    id: network.node('alice').peerId,
    publicKey: network.node('alice').peerId,
  });
  const bobIdentity = createAgentIdentity({
    id: network.node('bob').peerId,
    publicKey: network.node('bob').peerId,
  });

  const policy = createPolicy({
    id: 'policy-real-axl-quote',
    allowedActions: ['request-quote'],
    constraints: [
      { type: 'max-amount', value: 5n, actionTypes: ['request-quote'] },
      {
        type: 'max-cumulative-amount',
        value: 10n,
        actionTypes: ['request-quote'],
      },
      {
        type: 'allowed-metadata-value',
        key: 'assetPair',
        values: ['ETH/USDC'],
        actionTypes: ['request-quote'],
      },
      {
        type: 'allowed-metadata-value',
        key: 'venue',
        values: ['bob-quote-agent'],
        actionTypes: ['request-quote'],
      },
    ],
    expiresAt: new Date('2026-05-01T00:00:00.000Z'),
  });
  const policyHash = hashPolicy(policy);
  const credential = await issueLocalCredential({
    identity: aliceIdentity,
    policy,
    id: 'credential-real-axl-quote',
    issuedAt: new Date('2026-04-28T00:00:00.000Z'),
    signer: localDelegationSigner('principal-real-axl-demo'),
  });
  const proof = noirProofs();

  const alice = createAgentPeer({
    identity: aliceIdentity,
    transport: aliceTransport,
  });
  const bob = createAgentPeer({
    identity: bobIdentity,
    transport: bobTransport,
  });

  console.log(`Alice AgentIO peer id: ${alice.identity.id}`);
  console.log(`Bob AgentIO peer id: ${bob.identity.id}`);
  console.log(`Delegated policy hash: ${policyHash}`);

  bob.onMessage(async (message) => {
    console.log(
      `Bob received message ${message.id ?? '<no-id>'} of type ${message.type} from Alice.  Content: ${JSON.stringify(toJsonSafe(message.payload)).slice(0, 200)}...`,
    );
    if (message.type !== 'quote.request') {
      return;
    }

    const verification = await verifyMessageAction(message, proof, {
      agentId: alice.identity.id,
      actionType: 'request-quote',
      policyHash,
    });

    if (!verification.valid) {
      console.log(`Bob rejected request: ${verification.reason}`);
      return;
    }

    console.log(
      `Bob verified action: ${verification.action.type} ${String(verification.action.amount)} ETH/USDC`,
    );
    await bob.send(
      message.sender,
      createAgentReply({
        id: 'quote-reply-1',
        type: 'quote.reply',
        sender: bob.identity.id,
        createdAt: new Date('2026-04-28T12:00:01.000Z'),
        request: { ...message, id: message.id ?? 'quote-request-1' },
        payload: {
          accepted: true,
          price: '1 ETH = 3000 USDC',
          verifiedPolicyHash: policyHash,
        },
      }),
    );
  });

  console.log('Alice creates a real Noir proof-backed quote request.');
  const request = await createProofBackedMessage({
    id: 'quote-request-1',
    type: 'quote.request',
    sender: alice.identity.id,
    correlationId: 'real-axl-proof-backed-quote-1',
    createdAt: now,
    credential,
    policy,
    state: { cumulativeSpend: 0n, updatedAt: now },
    action: createActionIntent({
      type: 'request-quote',
      amount: 1n,
      metadata: {
        assetPair: 'ETH/USDC',
        venue: 'bob-quote-agent',
      },
    }),
    proof,
    now,
    payload: {
      assetPair: 'ETH/USDC',
      venue: 'bob-quote-agent',
    },
  });

  console.log(
    `Encoded quote request size: ${encodeAgentMessage(request).byteLength} bytes.`,
  );
  console.log('Alice asks Bob for a quote through the real AXL transport...');
  const reply = await alice.request(bob.identity.id, request, {
    expectedType: 'quote.reply',
    timeoutMs: 10_000,
  });

  console.log(
    `Alice received verified quote reply: ${String(reply.payload.price)}`,
  );
  console.log(
    `Bob echoed verified policy hash: ${String(reply.payload.verifiedPolicyHash)}`,
  );
} finally {
  aliceTransport.stop();
  bobTransport.stop();
  await network.stop();
  await rm(directory, { recursive: true, force: true });
  console.log('Stopped local AXL AgentIO example.');
}
