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
  llmReasoningEngine,
  localAxlTransport,
  localDelegationSigner,
  localNoirProofs,
  localOgStorage,
  localVerifyingExecution,
  mockLlmClient,
  verifyLocalDelegation,
  verifyMessageAction,
  type CorrelatedAgentMessage,
  type LlmCompletionRequest,
} from '@0xagentio/sdk';

/**
 * Demonstrates dynamic reasoning without making a network model call.
 *
 * Alice first asks Bob for verified market context. A mock LLM then receives
 * the goal and Bob's quote as observations, proposes a swap, and the normal
 * runtime still validates, proves, stores, and executes the action. This shows
 * where 0G Compute, OpenAI, Anthropic, or a local model will plug in later.
 */

const now = new Date('2026-04-30T12:00:00.000Z');

logTitle('0xAgentio LLM reasoning flow');
logStep('Value prop');
logDetail(
  'What this demonstrates',
  'LLM reasoning proposes an action, but policy validation and proof generation still enforce authority',
);

logStep('1. Create delegated Alice and market/execution agent Bob');
const principalId = 'principal-treasury';
const aliceIdentity = createAgentIdentity({
  id: 'agent-alice-llm',
  publicKey: 'agent-public-key-alice-llm',
});
const bobIdentity = createAgentIdentity({
  id: 'agent-bob-market-executor',
  publicKey: 'agent-public-key-bob-market-executor',
});
const policy = createPolicy({
  id: 'policy-llm-rebalance',
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
  id: 'credential-alice-llm-rebalance',
  issuedAt: now,
  signer: localDelegationSigner(principalId),
});
logDetail('Principal', principalId);
logDetail('Alice', aliceIdentity.id);
logDetail('Bob', bobIdentity.id);
logDetail('Policy commitment', policyHash);

logStep('2. Create local proof, storage, and transport adapters');
const proof = localNoirProofs();
const storage = localOgStorage();
const transport = localAxlTransport('agentio/llm-reasoning');
const alicePeer = createAgentPeer({ identity: aliceIdentity, transport });
const bobPeer = createAgentPeer({ identity: bobIdentity, transport });
logDetail('Proof', 'local Noir-shaped proof adapter');
logDetail('Storage', 'local 0G-shaped storage adapter');
logDetail('Transport', 'local AXL-shaped transport adapter');

installBobQuoteEndpoint();

logStep('3. Alice requests verified market context from Bob');
const quoteRequest = await createProofBackedMessage({
  id: 'llm-quote-request-1',
  correlationId: 'llm-rebalance-session-1',
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

logStep('4. Mock LLM reasons over goal, policy, state, and Bob quote');
const llm = mockLlmClient((request) =>
  decideFromPromptAndQuote(request, offeredOutputPerInput),
);
const reasoning = llmReasoningEngine({
  client: llm,
  goal: [
    'Rebalance ETH/USDC if the quote is at least 1:2.',
    `Latest Bob quote: 1:${offeredOutputPerInput}.`,
    `Quote id: ${quoteReply.id}.`,
  ].join(' '),
  instructions:
    'If the quote is acceptable, propose a swap on uniswap-demo for 250 units.',
  allowedActionTypes: ['swap'],
});

logStep(
  '5. Alice runtime uses LLM reasoning but keeps deterministic enforcement',
);
const alice = createAgentRuntime({
  identity: aliceIdentity,
  credential,
  policy,
  initialState: { cumulativeSpend: 0n, updatedAt: now },
  reasoning,
  delegationVerifier: verifyLocalDelegation,
  proof,
  storage,
  execution: localVerifyingExecution(proof, async ({ action, proof }) => {
    logDetail(
      'Bob execution adapter verified',
      `${proof.publicInputs.agentId} may ${proof.publicInputs.actionType}`,
    );

    return {
      success: true,
      reference: `mock-uniswap-receipt:${proof.publicInputs.policyHash}:${action.type}`,
      details: {
        executor: bobIdentity.id,
        assetPair: action.metadata?.assetPair,
        quoteId: action.metadata?.quoteId,
        amount: action.amount,
      },
    };
  }),
  now: () => now,
  createEventId: () => 'audit-event-llm-reasoning-1',
});
const result = await alice.startOnce();
if (result.status !== 'accepted') {
  throw new Error(`Expected accepted action, got ${result.status}.`);
}
logDetail('Runtime result', result.status);
logDetail(
  'LLM proposed action',
  `${result.action.type} ${String(result.action.amount)}`,
);
logDetail('Execution receipt', result.execution?.reference ?? 'none');

logStep('6. Inspect persisted state and audit trail');
const latestState = await alice.loadState();
logDetail('Cumulative spend', String(latestState.cumulativeSpend));
logDetail('0G-shaped records', String(storage.getRecords().length));
logDetail('Audit events', String(storage.getAuditEvents().length));

logStep('Outcome');
logDetail(
  'Why it matters',
  'model output is useful for planning, but AgentIO still validates, proves, and audits the final action',
);

/**
 * Installs Bob's verified quote endpoint.
 *
 * Bob checks Alice's proof before returning market context. This keeps even
 * read-style requests accountable when the response consumes work or reveals
 * useful data.
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
    const reply = createAgentReply({
      id: 'llm-quote-reply-1',
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

/**
 * Simulates a provider response using the same request shape a real provider sees.
 *
 * The function reads the prompt payload to make the example demonstrate actual
 * dynamic context passing instead of returning a hard-coded action blindly.
 */
function decideFromPromptAndQuote(
  request: LlmCompletionRequest,
  offeredOutputPerInput: number,
): string {
  const prompt = readPromptPayload(request);
  logDetail('LLM received goal', readStringPayload(prompt, 'goal'));

  if (offeredOutputPerInput < 2) {
    return JSON.stringify({
      decision: 'skip',
      reason: 'Quote is below the minimum acceptable output ratio.',
    });
  }

  return JSON.stringify({
    decision: 'act',
    action: {
      type: 'swap',
      amount: '250',
      metadata: {
        assetPair: 'ETH/USDC',
        venue: 'uniswap-demo',
        quoteId: quoteReply.id,
        offeredOutputPerInput,
        reason:
          'LLM accepted Bob quote because it meets the rebalance threshold.',
      },
    },
    reason: 'Quote meets the minimum threshold.',
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

function readPromptPayload(
  request: LlmCompletionRequest,
): Readonly<Record<string, unknown>> {
  const content = request.messages[0]?.content;
  if (content === undefined) {
    throw new Error('LLM request did not include a prompt message.');
  }

  const parsed = JSON.parse(content) as unknown;
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('LLM prompt message must be a JSON object.');
  }

  return parsed as Readonly<Record<string, unknown>>;
}

function readStringPayload(
  payload: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = payload[key];
  if (typeof value !== 'string') {
    throw new Error(`Expected string payload field ${key}.`);
  }

  return value;
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
