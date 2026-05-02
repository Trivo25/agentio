import {
  createActionIntent,
  createAgentIdentity,
  createAgentMessage,
  createAgentRuntime,
  createPolicy,
  hashPolicy,
  issueLocalCredential,
  localAxlTransport,
  localDelegationSigner,
  localMemoryStorage,
  localNoirProofs,
  localVerifyingExecution,
  staticReasoningEngine,
  verifyLocalDelegation,
  type AgentMessage,
  type AgentStepResult,
} from '@0xagentio/sdk';

/**
 * Demonstrates the high-level agent runtime API.
 *
 * The runtime is the SDK surface a developer reaches for when they want a real
 * agent object: it owns the decision loop, uses the configured proof backend,
 * persists state and audit events, optionally executes the authorized action,
 * and can listen or send messages through a transport adapter.
 */

const now = new Date('2026-04-25T12:00:00.000Z');

logTitle('0xAgentio agent runtime flow');

logStep('Creating Alice and Bob identities');
const aliceIdentity = createAgentIdentity({
  id: 'agent-alice-runtime',
  publicKey: 'agent-public-key-alice-runtime',
});
const bobIdentity = createAgentIdentity({
  id: 'agent-bob-observer',
  publicKey: 'agent-public-key-bob-observer',
});
logDetail('Alice', aliceIdentity.id);
logDetail('Bob', bobIdentity.id);

logStep('Creating a delegated policy for Alice');
const policy = createPolicy({
  id: 'policy-runtime-swap',
  allowedActions: ['swap'],
  constraints: [
    { type: 'max-amount', value: 500n, actionTypes: ['swap'] },
    {
      type: 'allowed-metadata-value',
      key: 'assetPair',
      values: ['ETH/USDC'],
      actionTypes: ['swap'],
    },
  ],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
});
const policyHash = hashPolicy(policy);
const credential = await issueLocalCredential({
  identity: aliceIdentity,
  policy,
  id: 'credential-runtime-alice',
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
  signer: localDelegationSigner('principal-runtime-demo'),
});
logDetail('Policy commitment', policyHash);
logDetail('Credential', credential.id);

logStep('Creating local adapters');
const proof = localNoirProofs();
const aliceStorage = localMemoryStorage();
const bobStorage = localMemoryStorage();
const transport = localAxlTransport('agentio/runtime-demo');
logDetail('Proof', 'local Noir-shaped proof adapter');
logDetail('Storage', 'in-memory storage adapters');
logDetail('Transport', 'local AXL-shaped transport');

logStep('Creating Alice runtime');
const swapAction = createActionIntent({
  type: 'swap',
  amount: 250n,
  metadata: {
    assetPair: 'ETH/USDC',
    reason: 'rebalance portfolio back to target allocation',
  },
});
const alice = createAgentRuntime({
  identity: aliceIdentity,
  credential,
  policy,
  initialState: {
    cumulativeSpend: 0n,
    updatedAt: new Date('2026-04-25T00:00:00.000Z'),
  },
  reasoning: staticReasoningEngine(swapAction),
  delegationVerifier: verifyLocalDelegation,
  proof,
  storage: aliceStorage,
  transport,
  execution: localVerifyingExecution(proof, async ({ action, proof }) => {
    logDetail(
      'Executor checked proof',
      `${proof.publicInputs.actionType} for ${proof.publicInputs.agentId}`,
    );
    return {
      success: true,
      reference: `local-swap-receipt:${action.type}:${action.metadata?.assetPair}`,
      details: {
        assetPair: action.metadata?.assetPair,
        amount: action.amount,
      },
    };
  }),
  now: () => now,
  createEventId: () => 'event-runtime-alice-1',
});

logStep('Creating Bob runtime as a listener');
const bob = createAgentRuntime({
  identity: bobIdentity,
  credential,
  policy,
  initialState: {
    cumulativeSpend: 0n,
    updatedAt: new Date('2026-04-25T00:00:00.000Z'),
  },
  reasoning: staticReasoningEngine('skip'),
  proof,
  storage: bobStorage,
  transport,
});
const bobInbox: AgentMessage[] = [];
bob.onMessage((message) => {
  if (
    message.type !== 'runtime-execution-summary' ||
    message.sender !== alice.identity.id
  ) {
    return;
  }

  bobInbox.push(message);
  logDetail('Bob received summary', String(message.payload.reference));
});
logDetail('Bob listener', 'waiting for Alice execution summaries');

logStep('Alice runs one decision cycle');
const result = await alice.startOnce();
logDetail('Decision result', describeResult(result));

logStep('Alice sends Bob a summary message');
const summary = createAgentMessage({
  id: 'runtime-summary-1',
  type: 'runtime-execution-summary',
  sender: alice.identity.id,
  createdAt: new Date('2026-04-25T12:00:01.000Z'),
  payload: createSummaryPayload(result),
});
await alice.send(bob.identity.id, summary);
await deliverLatestLocalEnvelope();

logStep('Reading runtime state and audit trail');
const latestState = await alice.loadState();
const auditEvents = aliceStorage.getAuditEvents();
logDetail('Alice cumulative spend', String(latestState.cumulativeSpend));
logDetail('Alice audit events', String(auditEvents.length));
logDetail('Bob received messages', String(bobInbox.length));

/**
 * Delivers the last local transport envelope to registered listeners.
 *
 * Real transports deliver messages over the network. The local AXL-shaped
 * adapter records envelopes first, so examples explicitly deliver the latest
 * message to make the send/listen boundary visible during execution.
 */
async function deliverLatestLocalEnvelope(): Promise<void> {
  const latest = transport.getEnvelopes().at(-1);
  if (latest === undefined) {
    throw new Error('No local transport envelope was available to deliver.');
  }

  logDetail(
    'Local transport delivered',
    `${latest.message.type} -> ${latest.recipient}`,
  );
  await transport.receive(latest.message);
}

/** Returns a readable one-line description for the runtime decision result. */
function describeResult(result: AgentStepResult): string {
  if (result.status === 'accepted') {
    return `accepted ${result.action.type} with ${result.proof.format}`;
  }

  if (result.status === 'rejected') {
    return `rejected with ${result.validation.issues.length} issue(s)`;
  }

  return 'skipped';
}

/**
 * Creates the compact payload Bob needs from Alice's completed runtime step.
 *
 * Applications usually do not want to forward the entire internal result. A
 * small summary keeps peer messages stable while audit storage preserves the
 * full local record for debugging and compliance.
 */
function createSummaryPayload(
  result: AgentStepResult,
): Readonly<Record<string, unknown>> {
  if (result.status !== 'accepted') {
    return { status: result.status };
  }

  return {
    status: result.status,
    actionType: result.action.type,
    amount: result.action.amount,
    reference: result.execution?.reference,
    policyHash: result.proof.publicInputs.policyHash,
  };
}

function logTitle(title: string): void {
  console.log(`\n${title}`);
  console.log('='.repeat(title.length));
}

function logStep(message: string): void {
  console.log(`\n-> ${message}`);
}

function logDetail(label: string, value: string): void {
  console.log(`  - ${label}: ${value}`);
}
