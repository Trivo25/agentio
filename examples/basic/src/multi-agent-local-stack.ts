import {
  createActionIntent,
  createAgentIdentity,
  createPolicy,
  createTrustedAgent,
  hashPolicy,
  issueLocalCredential,
  localAxlTransport,
  localDelegationSigner,
  localVerifyingExecution,
  localNoirProofs,
  localOgStorage,
  onVerifiedMessage,
  staticReasoningEngine,
  verifyLocalDelegation,
} from '@0xagentio/sdk';

import { toJsonSafe } from './json.js';

// This is the Milestone 1 local stack demo.
// Alice is an autonomous portfolio agent. A principal delegates a constrained
// rebalance policy to Alice. Bob is a local executor agent working for the
// future Uniswap adapter: he independently verifies Alice's proof before
// returning a mock execution receipt.

const principalId = 'principal-treasury';

const alice = createAgentIdentity({
  id: 'agent-alice-rebalancer',
  publicKey: 'agent-public-key-alice-rebalancer',
});

const bob = createAgentIdentity({
  id: 'agent-bob-uniswap-executor',
  publicKey: 'agent-public-key-bob-uniswap-executor',
});

const policy = createPolicy({
  id: 'policy-treasury-rebalance',
  allowedActions: ['swap'],
  constraints: [
    { type: 'max-amount', value: 500n, actionTypes: ['swap'] },
    {
      type: 'allowed-metadata-value',
      key: 'assetPair',
      values: ['ETH/USDC'],
      actionTypes: ['swap'],
    },
    {
      type: 'allowed-metadata-value',
      key: 'venue',
      values: ['uniswap-demo'],
      actionTypes: ['swap'],
    },
  ],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
});

const policyHash = hashPolicy(policy);
const credential = await issueLocalCredential({
  identity: alice,
  policy,
  id: 'credential-alice-treasury-rebalance',
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
  signer: localDelegationSigner(principalId),
});

const rebalanceAction = createActionIntent({
  type: 'swap',
  amount: 250n,
  metadata: {
    assetPair: 'ETH/USDC',
    venue: 'uniswap-demo',
    reason: 'portfolio drift exceeded local threshold',
  },
});

const proof = localNoirProofs();
const storage = localOgStorage();
const transport = localAxlTransport('agentio/rebalance-signals');
const bobTrustedMessages: unknown[] = [];
const bobRejectedMessages: unknown[] = [];
const bobExecutionReviews: unknown[] = [];

onVerifiedMessage(transport, proof, {
  onTrusted(result) {
    bobTrustedMessages.push({
      verifier: bob.id,
      acceptedFrom: result.message.sender,
      actionType: result.message.payload.action,
      proofFormat: result.proof.format,
      verification: result.verification,
    });
  },
  onRejected(result) {
    bobRejectedMessages.push({
      verifier: bob.id,
      rejectedFrom: result.message.sender,
      reason: result.reason,
    });
  },
});

const agent = createTrustedAgent({
  identity: alice,
  credential,
  policy,
  initialState: {
    cumulativeSpend: 0n,
    updatedAt: new Date('2026-04-25T00:00:00.000Z'),
  },
  reasoning: staticReasoningEngine(rebalanceAction),
  delegationVerifier: verifyLocalDelegation,
  proof,
  storage,
  execution: localVerifyingExecution(
    proof,
    async ({ identity, action, proof }) => {
      const review = {
        executor: bob.id,
        requester: identity.id,
        checked: ['proof-verification', 'agentId', 'policyHash', 'actionType'],
        decision: 'execute-mock-uniswap-order',
      };
      bobExecutionReviews.push(review);

      return {
        success: true,
        reference: `mock-uniswap-receipt:${proof.publicInputs.policyHash}:${action.type}`,
        details: {
          executor: bob.id,
          venue: action.metadata?.venue,
          assetPair: action.metadata?.assetPair,
          amount: action.amount,
          review,
        },
      };
    },
  ),
  now: () => new Date('2026-04-25T12:00:00.000Z'),
  createEventId: () => 'event-alice-rebalance-1',
});

const aliceResult = await agent.startOnce();

if (aliceResult.status === 'accepted') {
  const proofBackedMessage = {
    type: 'rebalance-executed',
    sender: alice.id,
    createdAt: new Date('2026-04-25T12:00:01.000Z'),
    payload: {
      action: aliceResult.action,
      execution: aliceResult.execution,
      proof: aliceResult.proof,
      policyHash,
    },
  };

  await transport.send(bob.id, proofBackedMessage);
  await transport.receive(proofBackedMessage);
}

const spoofedMessage = {
  type: 'rebalance-executed',
  sender: 'agent-mallory-spoofer',
  createdAt: new Date('2026-04-25T12:00:02.000Z'),
  payload: {
    action: rebalanceAction,
    policyHash,
  },
};

await transport.send(bob.id, spoofedMessage);
await transport.receive(spoofedMessage);

console.log(
  JSON.stringify(
    toJsonSafe({
      scenario:
        'principal-delegated treasury rebalance with a verifying Uniswap-executor agent',
      whyItMatters: [
        'Alice can act autonomously without unrestricted authority.',
        'The principal policy constrains what Alice may do.',
        'Bob independently verifies Alice before returning a mock execution receipt.',
        'Other agents can verify Alice’s proof-backed result message instead of trusting Alice blindly.',
        'The audit trail is stored through a 0G-shaped adapter seam.',
      ],
      principalId,
      agents: { alice, bob },
      policyHash,
      credential,
      aliceResult,
      storageRecords: storage.getRecords(),
      axlEnvelopes: transport.getEnvelopes(),
      bobExecutionReviews,
      bobTrustedMessages,
      bobRejectedMessages,
    }),
    null,
    2,
  ),
);
