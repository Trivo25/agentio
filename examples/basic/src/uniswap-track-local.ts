import {
  createActionIntent,
  createAgentIdentity,
  createAgentMessage,
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
  type AgentMessage,
  type CorrelatedAgentMessage,
  type CredentialProof,
  type ExecutionResult,
} from '@0xagentio/sdk';

/**
 * Demonstrates a Uniswap-focused AgentIO flow without live credentials.
 *
 * Alice is a delegated treasury agent. Bob is modeled as a Uniswap gateway
 * agent that will not quote or execute unless Alice sends a proof-backed
 * request. The example mirrors the real Trading API shape while keeping the
 * network calls local so the trust boundary is easy to inspect and run in CI.
 */

type UniswapGoal = {
  readonly chainId: number;
  readonly tokenIn: string;
  readonly tokenOut: string;
  readonly assetPair: string;
  readonly venue: string;
  readonly amountIn: bigint;
  readonly minimumAmountOut: bigint;
  readonly maxSlippageBips: number;
};

type UniswapQuote = {
  readonly requestId: string;
  readonly quoteId: string;
  readonly chainId: number;
  readonly tokenIn: string;
  readonly tokenOut: string;
  readonly amountIn: bigint;
  readonly amountOut: bigint;
  readonly minimumAmountOut: bigint;
  readonly route: readonly string[];
  readonly routing: 'CLASSIC' | 'DUTCH_V2';
  readonly permit2Required: boolean;
  readonly simulated: boolean;
  readonly gasEstimateUsd: string;
};

type UniswapStats = {
  quoteProofsVerified: number;
  quoteRequestsRejected: number;
  swapProofsVerified: number;
  swapRequestsRejected: number;
  swapsExecuted: number;
};

const now = new Date('2026-04-30T12:00:00.000Z');
const principalId = 'principal-treasury-safe';
const goal: UniswapGoal = {
  chainId: 1,
  tokenIn: 'USDC',
  tokenOut: 'ETH',
  assetPair: 'USDC/ETH',
  venue: 'uniswap-trading-api',
  amountIn: 1_250n,
  minimumAmountOut: 3n,
  maxSlippageBips: 50,
};
const stats: UniswapStats = {
  quoteProofsVerified: 0,
  quoteRequestsRejected: 0,
  swapProofsVerified: 0,
  swapRequestsRejected: 0,
  swapsExecuted: 0,
};

logTitle('0xAgentio × Uniswap local track demo');
logStep('1. Create Alice and Bob');
const aliceIdentity = createAgentIdentity({
  id: 'agent-alice-treasury-rebalancer',
  publicKey: 'agent-public-key-alice-treasury-rebalancer',
});
const bobIdentity = createAgentIdentity({
  id: 'agent-bob-uniswap-gateway',
  publicKey: 'agent-public-key-bob-uniswap-gateway',
});
logDetail('Alice', 'treasury agent that can act only within delegated policy');
logDetail('Bob', 'Uniswap gateway agent that verifies proofs before API work');

logStep('2. Delegate narrow Uniswap authority to Alice');
const policy = createPolicy({
  id: 'policy-uniswap-usdc-eth-rebalance',
  allowedActions: ['uniswap.quote', 'uniswap.swap'],
  constraints: [
    {
      type: 'max-amount',
      value: 1_500n,
      actionTypes: ['uniswap.quote', 'uniswap.swap'],
    },
    {
      type: 'max-cumulative-amount',
      value: 1_500n,
      actionTypes: ['uniswap.swap'],
    },
    {
      type: 'allowed-metadata-value',
      key: 'venue',
      values: ['uniswap-trading-api'],
      actionTypes: ['uniswap.quote', 'uniswap.swap'],
    },
    {
      type: 'allowed-metadata-value',
      key: 'assetPair',
      values: ['USDC/ETH'],
      actionTypes: ['uniswap.quote', 'uniswap.swap'],
    },
  ],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
});
const policyHash = hashPolicy(policy);
const credential = await issueLocalCredential({
  identity: aliceIdentity,
  policy,
  id: 'credential-alice-uniswap-rebalance',
  issuedAt: now,
  signer: localDelegationSigner(principalId),
});
logDetail('Policy', 'Alice may quote/swap USDC→ETH through Uniswap up to 1,500 units');
logDetail('Policy commitment', policyHash);

logStep('3. Create local adapters that mirror the live stack');
const proof = localNoirProofs();
const storage = localOgStorage();
const transport = localAxlTransport('agentio/uniswap-track-demo');
const alicePeer = createAgentPeer({ identity: aliceIdentity, transport });
const bobPeer = createAgentPeer({ identity: bobIdentity, transport });
installBobUniswapGateway();
logDetail('Proof', 'local Noir-shaped proof adapter');
logDetail('Storage', 'local 0G-shaped state and audit storage');
logDetail('Transport', 'local AXL-shaped Alice ↔ Bob messages');

logStep('4. Show the defense: Bob rejects unproved Uniswap work');
await sendUnprovedMalloryQuoteRequest();
logDetail('Rejected quote requests', String(stats.quoteRequestsRejected));

logStep('5. Alice sends a proof-backed Uniswap quote request');
const quoteRequest = await createProofBackedMessage({
  id: 'uniswap-quote-request-1',
  correlationId: 'uniswap-rebalance-session-1',
  type: 'uniswap.quote.request',
  sender: aliceIdentity.id,
  createdAt: now,
  credential,
  policy,
  state: { cumulativeSpend: 0n, updatedAt: now },
  action: createActionIntent({
    type: 'uniswap.quote',
    amount: goal.amountIn,
    metadata: quoteMetadata(goal),
  }),
  proof,
  now,
  payload: {
    policyHash,
    quote: {
      chainId: goal.chainId,
      tokenIn: goal.tokenIn,
      tokenOut: goal.tokenOut,
      amount: goal.amountIn,
      slippageBips: goal.maxSlippageBips,
      routingPreference: 'BEST_PRICE',
      permit2: true,
    },
  },
});
const pendingQuote = alicePeer.request(bobIdentity.id, quoteRequest, {
  expectedType: 'uniswap.quote.reply',
  timeoutMs: 1_000,
});
await transport.receive(quoteRequest);
const quoteReply = (await pendingQuote) as CorrelatedAgentMessage;
const quote = readQuote(quoteReply);
logDetail('Bob returned quote', `${quote.amountIn} ${quote.tokenIn} → ${quote.amountOut} ${quote.tokenOut}`);
logDetail('Route', quote.route.join(' → '));
logDetail('Permit2 required', String(quote.permit2Required));

logStep('6. Alice reasons over the Uniswap quote');
const decision = decideFromQuote(goal, quote);
logDetail('Decision', decision.accept ? 'accept quote and request swap' : decision.reason);
if (!decision.accept) {
  throw new Error(`Expected Alice to accept the local quote: ${decision.reason}`);
}

logStep('7. Alice runtime proves, persists, and asks Bob to execute');
const alice = createAgentRuntime({
  identity: aliceIdentity,
  credential,
  policy,
  initialState: { cumulativeSpend: 0n, updatedAt: now },
  reasoning: staticReasoningEngine(createSwapAction(goal, quote)),
  delegationVerifier: verifyLocalDelegation,
  proof,
  storage,
  execution: localVerifyingExecution(proof, async ({ action, proof }) => {
    const result = await requestBobSwapExecution(action, proof);
    return result;
  }),
  now: () => new Date('2026-04-30T12:00:02.000Z'),
  createEventId: () => 'audit-uniswap-swap-1',
});
const result = await alice.startOnce();
if (result.status !== 'accepted') {
  throw new Error(`Expected accepted Uniswap swap, got ${result.status}.`);
}
logDetail('Runtime result', result.status);
logDetail('Execution receipt', result.execution?.reference ?? 'none');

logStep('8. Show proof binding: Bob rejects a tampered swap request');
await sendTamperedSwapRequest(result.action, result.proof);
logDetail('Rejected swap requests', String(stats.swapRequestsRejected));

logStep('9. Inspect state, audit, and trust-boundary checks');
const state = await alice.loadState();
assertScenario(state.cumulativeSpend === goal.amountIn, 'Alice state did not consume the swap amount.');
assertScenario(stats.quoteProofsVerified === 1, 'Bob did not verify exactly one quote proof.');
assertScenario(stats.swapProofsVerified === 1, 'Bob did not verify exactly one swap proof.');
assertScenario(stats.swapRequestsRejected === 1, 'Bob did not reject the tampered swap request.');
assertScenario(stats.swapsExecuted === 1, 'Bob did not execute exactly one mock Uniswap swap.');
logDetail('Cumulative spend', String(state.cumulativeSpend));
logDetail('Audit events', String(storage.getAuditEvents().length));
logDetail('Quote proofs verified', String(stats.quoteProofsVerified));
logDetail('Swap proofs verified', String(stats.swapProofsVerified));

logStep('Track demo takeaway');
logDetail(
  'Why this is Uniswap-specific',
  'the gateway can protect quote access, Permit2/swap preparation, and execution with proof-carrying agent requests',
);

/** Installs Bob's local Uniswap gateway behavior for quote and swap requests. */
function installBobUniswapGateway(): void {
  bobPeer.onMessage(async (message) => {
    if (message.type === 'uniswap.quote.request') {
      await handleQuoteRequest(message);
      return;
    }

    if (message.type === 'uniswap.swap.request') {
      await handleSwapRequest(message);
    }
  });
}

/** Verifies Alice's quote authority before returning a Uniswap-shaped quote. */
async function handleQuoteRequest(message: AgentMessage): Promise<void> {
  logDetail('Bob received quote request', `${message.id ?? message.type} from ${message.sender}`);
  const verification = await verifyMessageAction(message, proof, {
    agentId: aliceIdentity.id,
    actionType: 'uniswap.quote',
    policyHash,
  });

  if (!verification.valid) {
    stats.quoteRequestsRejected += 1;
    logDetail('Bob rejected quote request', verification.reason);
    return;
  }

  stats.quoteProofsVerified += 1;
  logDetail('Bob verified quote proof', `${verification.action.type} for ${verification.action.metadata?.assetPair}`);

  const quote = createMockUniswapQuote(goal);
  const reply = createAgentReply({
    id: 'uniswap-quote-reply-1',
    type: 'uniswap.quote.reply',
    sender: bobIdentity.id,
    createdAt: new Date('2026-04-30T12:00:01.000Z'),
    request: message as CorrelatedAgentMessage,
    payload: {
      quote,
      note: 'Local mock shaped like a Uniswap Trading API quote response.',
    },
  });

  logDetail('Bob simulated Uniswap quote', `${quote.routing} route, gas ${quote.gasEstimateUsd}`);
  await bobPeer.send(aliceIdentity.id, reply);
  await transport.receive(reply);
}

/** Verifies Alice's final swap proof before returning a mock Uniswap receipt. */
async function handleSwapRequest(message: AgentMessage): Promise<void> {
  logDetail('Bob received swap request', `${message.id ?? message.type} from ${message.sender}`);
  const verification = await verifyMessageAction(message, proof, {
    agentId: aliceIdentity.id,
    actionType: 'uniswap.swap',
    policyHash,
  });

  if (!verification.valid) {
    stats.swapRequestsRejected += 1;
    logDetail('Bob rejected swap request', verification.reason);
    return;
  }

  stats.swapProofsVerified += 1;
  stats.swapsExecuted += 1;
  logDetail('Bob verified swap proof', `${verification.action.type} ${String(verification.action.amount)}`);
  logDetail('Bob executes mock Uniswap swap', String(verification.action.metadata?.quoteId));

  const reply = createAgentReply({
    id: 'uniswap-swap-reply-1',
    type: 'uniswap.swap.reply',
    sender: bobIdentity.id,
    createdAt: new Date('2026-04-30T12:00:03.000Z'),
    request: message as CorrelatedAgentMessage,
    payload: {
      receipt: {
        status: 'success',
        txHash: '0xmockuniswapreceipt0000000000000000000000000000000000000001',
        quoteId: verification.action.metadata?.quoteId,
        amountIn: verification.action.amount,
        amountOut: verification.action.metadata?.expectedAmountOut,
      },
    },
  });

  await bobPeer.send(aliceIdentity.id, reply);
  await transport.receive(reply);
}

/** Sends a malformed request to prove Bob does not spend Uniswap work without proof. */
async function sendUnprovedMalloryQuoteRequest(): Promise<void> {
  const message = createAgentMessage({
    id: 'mallory-unproved-quote-1',
    type: 'uniswap.quote.request',
    sender: 'agent-mallory',
    createdAt: new Date('2026-04-30T12:00:00.500Z'),
    payload: {
      quote: {
        chainId: goal.chainId,
        tokenIn: goal.tokenIn,
        tokenOut: goal.tokenOut,
        amount: goal.amountIn,
      },
    },
  });

  await transport.receive(message);
}

/**
 * Reuses Alice's valid proof with a modified swap action.
 *
 * Bob should reject this because AgentIO proofs are bound to the exact action
 * hash. This is the core difference between proof-carrying requests and a
 * bearer auth token that can be copied onto a different payload.
 */
async function sendTamperedSwapRequest(
  originalAction: ReturnType<typeof createActionIntent>,
  proofResult: CredentialProof,
): Promise<void> {
  const tamperedAction = createActionIntent({
    type: originalAction.type,
    amount: goal.amountIn + 100n,
    metadata: originalAction.metadata,
  });
  const message = createAgentMessage({
    id: 'mallory-tampered-swap-1',
    correlationId: 'uniswap-rebalance-session-1',
    type: 'uniswap.swap.request',
    sender: aliceIdentity.id,
    createdAt: new Date('2026-04-30T12:00:04.000Z'),
    payload: {
      policyHash,
      action: tamperedAction,
      proof: proofResult,
      quote,
    },
  });

  logDetail('Tampered request', `reused valid proof but changed amount to ${String(tamperedAction.amount)}`);
  await transport.receive(message);
}

/** Sends Alice's final proof-backed swap request to Bob's Uniswap gateway. */
async function requestBobSwapExecution(
  action: ReturnType<typeof createActionIntent>,
  proofResult: CredentialProof,
): Promise<ExecutionResult> {
  const request = createAgentMessage({
    id: 'uniswap-swap-request-1',
    correlationId: 'uniswap-rebalance-session-1',
    type: 'uniswap.swap.request',
    sender: aliceIdentity.id,
    createdAt: new Date('2026-04-30T12:00:02.500Z'),
    payload: {
      policyHash,
      action,
      proof: proofResult,
      quote,
    },
  });
  const pendingReply = alicePeer.request(bobIdentity.id, request, {
    expectedType: 'uniswap.swap.reply',
    timeoutMs: 1_000,
  });

  await alicePeer.send(bobIdentity.id, request);
  await transport.receive(request);
  const reply = (await pendingReply) as CorrelatedAgentMessage;
  const receipt = reply.payload.receipt;

  return {
    success: true,
    reference: isRecord(receipt) && typeof receipt.txHash === 'string' ? receipt.txHash : 'mock-uniswap-receipt',
    details: {
      gateway: bobIdentity.id,
      quoteId: action.metadata?.quoteId,
      receipt,
    },
  };
}

/** Creates a mock quote with the same decisions a real Uniswap quote would drive. */
function createMockUniswapQuote(goal: UniswapGoal): UniswapQuote {
  return {
    requestId: 'uniswap-request-local-1',
    quoteId: 'uniswap-quote-local-1',
    chainId: goal.chainId,
    tokenIn: goal.tokenIn,
    tokenOut: goal.tokenOut,
    amountIn: goal.amountIn,
    amountOut: 4n,
    minimumAmountOut: goal.minimumAmountOut,
    route: ['USDC', 'Uniswap v4 pool', 'ETH'],
    routing: 'CLASSIC',
    permit2Required: true,
    simulated: true,
    gasEstimateUsd: '$3.42',
  };
}

/** Applies Alice's application-level acceptance criteria to Bob's quote. */
function decideFromQuote(
  goal: UniswapGoal,
  quote: UniswapQuote,
): { readonly accept: true } | { readonly accept: false; readonly reason: string } {
  if (!quote.simulated) {
    return { accept: false, reason: 'quote simulation failed' };
  }

  if (quote.chainId !== goal.chainId) {
    return { accept: false, reason: 'quote is for the wrong chain' };
  }

  if (quote.tokenIn !== goal.tokenIn || quote.tokenOut !== goal.tokenOut) {
    return { accept: false, reason: 'quote token pair does not match goal' };
  }

  if (quote.amountOut < goal.minimumAmountOut) {
    return { accept: false, reason: 'quote output is below Alice minimum' };
  }

  return { accept: true };
}

/** Builds the final action that the runtime will validate, prove, persist, and execute. */
function createSwapAction(goal: UniswapGoal, quote: UniswapQuote) {
  return createActionIntent({
    type: 'uniswap.swap',
    amount: goal.amountIn,
    metadata: {
      ...quoteMetadata(goal),
      quoteId: quote.quoteId,
      requestId: quote.requestId,
      expectedAmountOut: quote.amountOut,
      minimumAmountOut: quote.minimumAmountOut,
      routing: quote.routing,
      permit2Required: quote.permit2Required,
    },
  });
}

function quoteMetadata(goal: UniswapGoal): Readonly<Record<string, unknown>> {
  return {
    venue: goal.venue,
    assetPair: goal.assetPair,
    chainId: goal.chainId,
    tokenIn: goal.tokenIn,
    tokenOut: goal.tokenOut,
    maxSlippageBips: goal.maxSlippageBips,
  };
}

function readQuote(message: CorrelatedAgentMessage): UniswapQuote {
  const quote = message.payload.quote;
  if (!isUniswapQuote(quote)) {
    throw new TypeError('Expected Uniswap quote payload.');
  }

  return quote;
}

function isUniswapQuote(value: unknown): value is UniswapQuote {
  return (
    isRecord(value) &&
    typeof value.requestId === 'string' &&
    typeof value.quoteId === 'string' &&
    typeof value.chainId === 'number' &&
    typeof value.tokenIn === 'string' &&
    typeof value.tokenOut === 'string' &&
    typeof value.amountIn === 'bigint' &&
    typeof value.amountOut === 'bigint' &&
    typeof value.minimumAmountOut === 'bigint' &&
    Array.isArray(value.route) &&
    value.route.every((part) => typeof part === 'string') &&
    (value.routing === 'CLASSIC' || value.routing === 'DUTCH_V2') &&
    typeof value.permit2Required === 'boolean' &&
    typeof value.simulated === 'boolean' &&
    typeof value.gasEstimateUsd === 'string'
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
  console.log(`\n▶ ${message}`);
}

function logDetail(label: string, value: string): void {
  console.log(`  - ${label}: ${value}`);
}
