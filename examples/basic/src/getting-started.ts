import {
  createActionIntent,
  createAgentIdentity,
  createAgentPeer,
  createAgentReply,
  createAgentRuntime,
  createPolicy,
  createProofBackedMessage,
  hashPolicy,
  issueLocalCredential,
  localAxlTransport,
  localDelegationSigner,
  localNoirProofs,
  localOgStorage,
  localVerifyingExecution,
  staticReasoningEngine,
  verifyLocalDelegation,
  verifyMessageAction,
  type CorrelatedAgentMessage,
} from '@0xagentio/sdk';

/**
 * Shows the smallest useful 0xAgentio story.
 *
 * A principal delegates bounded authority to Alice. Alice can then ask Bob for
 * information, prove that her request is authorized, reason over Bob's reply,
 * prove the final action, persist state, and execute through a verifying
 * adapter. The same code shape can swap local adapters for real Noir, 0G, AXL,
 * and domain-specific execution backends.
 */

const now = new Date('2026-04-30T12:00:00.000Z');

logTitle('0xAgentio getting started');
logStep('Value prop');
logDetail(
  'What this demonstrates',
  'agents carry proofs of delegated authority, and other agents verify before trusting or executing',
);

logStep('1. A principal delegates bounded authority to Alice');
const principalId = 'principal-treasury';
const aliceIdentity = createAgentIdentity({
  id: 'agent-alice',
  publicKey: 'agent-public-key-alice',
});
const bobIdentity = createAgentIdentity({
  id: 'agent-bob-market-and-execution',
  publicKey: 'agent-public-key-bob',
});
const policy = createPolicy({
  id: 'policy-rebalance-eth-usdc',
  allowedActions: ['request-quote', 'swap'],
  constraints: [
    { type: 'max-amount', value: 500n, actionTypes: ['request-quote', 'swap'] },
    {
      type: 'allowed-metadata-value',
      key: 'assetPair',
      values: ['ETH/USDC'],
      actionTypes: ['request-quote', 'swap'],
    },
    {
      type: 'allowed-metadata-value',
      key: 'venue',
      values: ['uniswap-demo'],
      actionTypes: ['request-quote', 'swap'],
    },
  ],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
});
const policyHash = hashPolicy(policy);
const credential = await issueLocalCredential({
  identity: aliceIdentity,
  policy,
  id: 'credential-alice-rebalance',
  issuedAt: now,
  signer: localDelegationSigner(principalId),
});
logDetail('Principal', principalId);
logDetail('Agent', aliceIdentity.id);
logDetail('Allowed actions', policy.allowedActions.join(', '));
logDetail('Policy commitment', policyHash);

logStep('2. The app chooses adapters');
const proof = localNoirProofs();
const storage = localOgStorage();
const transport = localAxlTransport('agentio/getting-started');
const alicePeer = createAgentPeer({ identity: aliceIdentity, transport });
const bobPeer = createAgentPeer({ identity: bobIdentity, transport });
const scenarioChecks = {
  bobVerifiedQuoteRequest: false,
  executionAdapterVerifiedSwap: false,
};
logDetail('Proof adapter', 'local Noir-shaped proof adapter');
logDetail('Storage adapter', 'local 0G-shaped storage adapter');
logDetail('Transport adapter', 'local AXL-shaped transport adapter');

installBobQuoteEndpoint();

logStep('3. Alice sends Bob a proof-backed quote request');
const quoteRequest = await createProofBackedMessage({
  id: 'quote-request-1',
  correlationId: 'rebalance-session-1',
  type: 'quote.request',
  sender: aliceIdentity.id,
  createdAt: now,
  credential,
  policy,
  state: { cumulativeSpend: 0n, updatedAt: now },
  action: createActionIntent({
    type: 'request-quote',
    amount: 250n,
    metadata: {
      assetPair: 'ETH/USDC',
      venue: 'uniswap-demo',
    },
  }),
  proof,
  now,
  payload: { policyHash },
});
logDetail('Request', `${quoteRequest.id} carries action + proof`);
const pendingQuote = alicePeer.request(bobIdentity.id, quoteRequest, {
  expectedType: 'quote.reply',
  timeoutMs: 1_000,
});
await transport.receive(quoteRequest);
const quoteReply = (await pendingQuote) as CorrelatedAgentMessage;
const offeredOutputPerInput = readNumberPayload(
  quoteReply,
  'offeredOutputPerInput',
);
logDetail('Bob quote', `1:${offeredOutputPerInput}`);

logStep('4. Alice reasons over Bob reply and creates the final action');
const minimumAcceptableOutputPerInput = 2;
if (offeredOutputPerInput < minimumAcceptableOutputPerInput) {
  throw new Error('Bob quote is outside Alice policy/application threshold.');
}
const swapAction = createActionIntent({
  type: 'swap',
  amount: 250n,
  metadata: {
    assetPair: 'ETH/USDC',
    venue: 'uniswap-demo',
    quoteId: quoteReply.id,
    offeredOutputPerInput,
    reason: 'rebalance drift is above threshold and quote is acceptable',
  },
});
logDetail('Decision', 'quote accepted, prepare swap');

logStep('5. Alice runtime validates, proves, stores, and executes');
const alice = createAgentRuntime({
  identity: aliceIdentity,
  credential,
  policy,
  initialState: { cumulativeSpend: 0n, updatedAt: now },
  reasoning: staticReasoningEngine(swapAction),
  delegationVerifier: verifyLocalDelegation,
  proof,
  storage,
  execution: localVerifyingExecution(proof, async ({ action, proof }) => {
    scenarioChecks.executionAdapterVerifiedSwap = true;
    logDetail(
      'Execution adapter verified final proof',
      `${proof.publicInputs.agentId} may ${proof.publicInputs.actionType}`,
    );

    return {
      success: true,
      reference: `mock-uniswap-receipt:${proof.publicInputs.policyHash}:${action.type}`,
      details: {
        executor: bobIdentity.id,
        assetPair: action.metadata?.assetPair,
        amount: action.amount,
      },
    };
  }),
  now: () => now,
  createEventId: () => 'audit-event-getting-started-1',
});
const result = await alice.startOnce();
if (result.status !== 'accepted') {
  throw new Error(`Expected accepted action, got ${result.status}.`);
}
logDetail('Runtime result', result.status);
logDetail('Execution receipt', result.execution?.reference ?? 'none');

logStep('6. The app can inspect stored state and audit records');
const latestState = await alice.loadState();
assertScenario(
  scenarioChecks.bobVerifiedQuoteRequest,
  'Bob did not verify Alice quote request.',
);
assertScenario(
  scenarioChecks.executionAdapterVerifiedSwap,
  'The execution adapter did not verify Alice final swap.',
);
assertScenario(
  latestState.cumulativeSpend === 250n,
  'Alice state was not persisted after the accepted action.',
);
logDetail('Cumulative spend', String(latestState.cumulativeSpend));
logDetail('0G-shaped records', String(storage.getRecords().length));
logDetail('Audit events', String(storage.getAuditEvents().length));

logStep('Outcome');
logDetail(
  'Why it matters',
  'Bob did not need to trust Alice manually; he verified proof-bound authority before replying/executing',
);

/**
 * Installs Bob's quote endpoint.
 *
 * Bob verifies Alice's request proof before spending work on a quote. This is
 * the same trust boundary a real market-data, API, compute, or execution agent
 * would enforce before serving another autonomous agent.
 */
function installBobQuoteEndpoint(): void {
  bobPeer.onMessage(async (message) => {
    if (
      message.type !== 'quote.request' ||
      message.sender !== aliceIdentity.id
    ) {
      return;
    }

    logDetail('Bob received request', message.id ?? message.type);
    const verification = await verifyMessageAction(message, proof, {
      agentId: aliceIdentity.id,
      actionType: 'request-quote',
      policyHash,
    });

    if (!verification.valid) {
      throw new Error(`Bob rejected quote request: ${verification.reason}`);
    }

    logDetail('Bob verified request proof', verification.action.type);
    scenarioChecks.bobVerifiedQuoteRequest = true;
    const reply = createAgentReply({
      id: 'quote-reply-1',
      type: 'quote.reply',
      sender: bobIdentity.id,
      createdAt: new Date('2026-04-30T12:00:01.000Z'),
      request: message as CorrelatedAgentMessage,
      payload: {
        offeredOutputPerInput: 3,
        note: 'mock route available through uniswap-demo',
      },
    });
    await bobPeer.send(aliceIdentity.id, reply);
    await transport.receive(reply);
  });
}

/** Reads a numeric field from a message payload and fails loudly if it is absent. */
function readNumberPayload(
  message: CorrelatedAgentMessage,
  key: string,
): number {
  const value = message.payload[key];
  if (typeof value !== 'number') {
    throw new Error(`Expected numeric payload field ${key}.`);
  }

  return value;
}

/** Fails the example if a trust boundary was skipped instead of demonstrated. */
function assertScenario(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
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
