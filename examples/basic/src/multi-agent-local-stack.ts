import {
  createActionIntent,
  createAgentIdentity,
  createAgentMessage,
  createAgentPeer,
  createAgentReply,
  createProofBackedMessage,
  createPolicy,
  createTrustedAgent,
  hashPolicy,
  issueLocalCredential,
  localAxlTransport,
  localDelegationSigner,
  localVerifyingExecution,
  localNoirProofs,
  localOgStorage,
  staticReasoningEngine,
  type CorrelatedAgentMessage,
  verifyMessageAction,
  verifyLocalDelegation,
} from '@0xagentio/sdk';

/**
 * Demonstrates a small local multi-agent stack.
 *
 * Alice is a delegated portfolio agent. Bob is a Uniswap-shaped executor agent
 * that can answer quote requests and later verify Alice's proof before mock
 * execution. Carol is an auditor agent that only trusts proof-backed messages.
 */

type RebalanceGoal = {
  readonly assetPair: string;
  readonly venue: string;
  readonly amount: bigint;
  readonly targetOutputPerInput: number;
  readonly minimumAcceptableOutputPerInput: number;
};

type QuoteInbox = {
  getReply(): CorrelatedAgentMessage | undefined;
};

type ScenarioStats = {
  readonly bobQuoteResponses: unknown[];
  readonly bobQuoteProofChecks: unknown[];
  readonly bobRejectedQuoteRequests: unknown[];
  readonly bobExecutionReviews: unknown[];
  readonly carolTrustedMessages: unknown[];
  readonly carolRejectedMessages: unknown[];
};

const principalId = 'principal-treasury';
const now = new Date('2026-04-25T12:00:00.000Z');

logTitle('0xAgentio local multi-agent stack');

logStep('Creating agents');
logDetail('Principal', principalId);
const alice = createAgentIdentity({
  id: 'agent-alice-rebalancer',
  publicKey: 'agent-public-key-alice-rebalancer',
});
const bob = createAgentIdentity({
  id: 'agent-bob-uniswap-executor',
  publicKey: 'agent-public-key-bob-uniswap-executor',
});
const carolIdentity = createAgentIdentity({
  id: 'agent-carol-auditor',
  publicKey: 'agent-public-key-carol-auditor',
});
logDetail('Created Alice', alice.id);
logDetail('Created Bob', bob.id);
logDetail('Created Carol', carolIdentity.id);

logStep('Creating delegated policy');
const policy = createRebalancePolicy();
const policyHash = hashPolicy(policy);
const credential = await issueLocalCredential({
  identity: alice,
  policy,
  id: 'credential-alice-treasury-rebalance',
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
  signer: localDelegationSigner(principalId),
});
logDetail('Allowed actions', policy.allowedActions.join(', '));
logDetail('Policy commitment', policyHash);
logDetail('Issued credential', `${credential.id} -> ${credential.agentId}`);

logStep('Defining Alice goal');
const goal: RebalanceGoal = {
  assetPair: 'ETH/USDC',
  venue: 'uniswap-demo',
  amount: 250n,
  targetOutputPerInput: 2,
  minimumAcceptableOutputPerInput: 2,
};
logDetail('Goal', `swap ${String(goal.amount)} ${goal.assetPair} on ${goal.venue}`);
logDetail('Target', `1:${goal.targetOutputPerInput} or better`);

logStep('Creating local adapters');
const proof = localNoirProofs();
const storage = localOgStorage();
const transport = localAxlTransport('agentio/rebalance-signals');
logDetail('Proof adapter', 'local Noir-shaped proofs');
logDetail('Storage adapter', 'local 0G-shaped storage');
logDetail('Transport adapter', 'local AXL-shaped topic agentio/rebalance-signals');

logStep('Creating peer listeners');
const alicePeer = createAgentPeer({ identity: alice, transport });
const bobPeer = createAgentPeer({ identity: bob, transport });
const carol = createAgentPeer({ identity: carolIdentity, transport });
const stats = createScenarioStats();
const quoteInbox = installAliceQuoteReplyListener();
installBobQuoteListener(stats);
logDetail('Alice listens for', 'Bob quote replies');
logDetail('Bob listens for', 'proof-backed quote requests');
logDetail('Carol listens for', 'proof-backed execution announcements');

logStep('Alice prepares a proof-backed quote request');
const quoteRequest = await createProofBackedQuoteRequest(goal);
logDetail('Sending quote request', `${quoteRequest.id} (${quoteRequest.correlationId})`);

logStep('Alice asks Bob for market/execution context');
await alicePeer.send(bob.id, quoteRequest);
logDetail('Waiting for Bob response', 'local transport delivery');
await transport.receive(quoteRequest);

const quoteReply = requireQuoteReply(quoteInbox);

logStep('Alice reasons over Bob quote');
const offeredOutputPerInput = readNumberPayload(quoteReply, 'offeredOutputPerInput');
const aliceAcceptsQuote = offeredOutputPerInput >= goal.minimumAcceptableOutputPerInput;
logDetail('Bob offered', `1:${offeredOutputPerInput}`);
logDetail('Alice decision', aliceAcceptsQuote ? 'quote is acceptable' : 'quote is outside acceptable range');
if (!aliceAcceptsQuote) {
  throw new Error('Alice rejected Bob quote because it was outside her acceptable range.');
}

const rebalanceAction = createSwapActionFromQuote(goal, quoteReply, offeredOutputPerInput);

logStep('Carol starts verified result listener');
installCarolVerifiedResultListener(stats);

logStep('Creating Alice trusted runtime');
const agent = createAliceRuntime(rebalanceAction, stats);

logStep('Alice proves and requests execution');
const aliceResult = await agent.startOnce();
logDetail('Alice result', aliceResult.status);
if (aliceResult.status === 'accepted') {
  logDetail('Execution receipt', aliceResult.execution?.reference ?? 'none');
}

logStep('Alice announces final result to Carol');
if (aliceResult.status === 'accepted') {
  const resultMessage = createAgentMessage({
    id: 'result-message-1',
    correlationId: quoteReply.correlationId,
    type: 'rebalance-executed',
    sender: alice.id,
    createdAt: new Date('2026-04-25T12:00:03.000Z'),
    payload: {
      action: aliceResult.action,
      execution: aliceResult.execution,
      proof: aliceResult.proof,
      policyHash,
    },
  });

  logDetail('Sending proof-backed result', `${resultMessage.id} -> ${carol.identity.id}`);
  await alicePeer.send(carol.identity.id, resultMessage);
  await transport.receive(resultMessage);
}

logStep('Mallory tries a spoofed result');
const spoofedMessage = createAgentMessage({
  id: 'spoof-message-1',
  correlationId: quoteReply.correlationId,
  type: 'rebalance-executed',
  sender: 'agent-mallory-spoofer',
  createdAt: new Date('2026-04-25T12:00:04.000Z'),
  payload: {
    action: rebalanceAction,
    policyHash,
  },
});
logDetail('Sending spoof without proof', `${spoofedMessage.id} -> ${carol.identity.id}`);
await alicePeer.send(carol.identity.id, spoofedMessage);
await transport.receive(spoofedMessage);

logStep('Final outcome');
logDetail('Alice status', aliceResult.status);
logDetail('Execution receipt', aliceResult.status === 'accepted' ? aliceResult.execution?.reference ?? 'none' : 'none');
logDetail('0G-shaped records written', String(storage.getRecords().length));
logDetail('AXL-shaped messages sent', String(transport.getEnvelopes().length));
logDetail('Carol trusted/rejected', `${stats.carolTrustedMessages.length}/${stats.carolRejectedMessages.length}`);

/** Creates the policy that constrains both quote requests and final execution. */
function createRebalancePolicy() {
  return createPolicy({
    id: 'policy-treasury-rebalance',
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
}

function createScenarioStats(): ScenarioStats {
  return {
    bobQuoteResponses: [],
    bobQuoteProofChecks: [],
    bobRejectedQuoteRequests: [],
    bobExecutionReviews: [],
    carolTrustedMessages: [],
    carolRejectedMessages: [],
  };
}

/** Installs Alice's inbox for quote replies from Bob. */
function installAliceQuoteReplyListener(): QuoteInbox {
  let quoteReply: CorrelatedAgentMessage | undefined;

  alicePeer.onMessage((message) => {
    if (message.type === 'swap-quote-reply' && message.sender === bob.id) {
      quoteReply = message as CorrelatedAgentMessage;
      logDetail('Alice received quote reply', `${quoteReply.id} replying to ${quoteReply.replyTo}`);
    }
  });

  return {
    getReply() {
      return quoteReply;
    },
  };
}

/** Installs Bob's quote endpoint with proof verification before replying. */
function installBobQuoteListener(stats: ScenarioStats): void {
  bobPeer.onMessage(async (message) => {
    if (message.type !== 'swap-quote-request' || message.sender !== alice.id) {
      return;
    }

    logDetail('Bob received quote request', message.id ?? message.type);

    const verification = await verifyMessageAction(message, proof, {
      agentId: alice.id,
      actionType: 'request-quote',
      policyHash,
    });

    stats.bobQuoteProofChecks.push({
      requester: message.sender,
      valid: verification.valid,
      expected: verification.expected,
    });

    logDetail('Bob verified quote proof', verification.valid ? 'accepted request-quote proof' : 'rejected quote request');

    if (!verification.valid) {
      stats.bobRejectedQuoteRequests.push({
        requester: message.sender,
        reason: verification.reason,
      });
      return;
    }

    const offeredOutputPerInput = 3;
    const reply = createAgentReply({
      id: 'quote-reply-1',
      type: 'swap-quote-reply',
      sender: bob.id,
      createdAt: new Date('2026-04-25T12:00:01.000Z'),
      request: message as CorrelatedAgentMessage,
      payload: {
        exactTargetAvailable: false,
        offeredOutputPerInput,
        note: 'Exact 1:2 route is unavailable; Bob can quote 1:3 instead.',
      },
    });

    stats.bobQuoteResponses.push(reply.payload);
    logDetail('Bob replies with quote', `1:${offeredOutputPerInput}`);
    await bobPeer.send(alice.id, reply);
    await transport.receive(reply);
  });
}

/**
 * Creates Alice's proof-backed quote request before Bob spends work on a quote.
 *
 * This mirrors the production flow where read-only quote requests may still
 * need authorization because they can consume resources or reveal market data.
 */
async function createProofBackedQuoteRequest(goal: RebalanceGoal): Promise<CorrelatedAgentMessage> {
  const quoteAction = createActionIntent({
    type: 'request-quote',
    amount: goal.amount,
    metadata: {
      assetPair: goal.assetPair,
      venue: goal.venue,
      targetOutputPerInput: goal.targetOutputPerInput,
    },
  });

  logDetail('Creating quote action', quoteAction.type);
  const message = await createProofBackedMessage({
    id: 'quote-request-1',
    correlationId: 'rebalance-session-1',
    type: 'swap-quote-request',
    sender: alice.id,
    createdAt: now,
    credential,
    policy,
    state: {
      cumulativeSpend: 0n,
      updatedAt: new Date('2026-04-25T00:00:00.000Z'),
    },
    action: quoteAction,
    proof,
    now,
    payload: { policyHash },
  });

  const messageProof = message.payload.proof as { format?: unknown };
  logDetail('Generated quote proof', typeof messageProof.format === 'string' ? messageProof.format : 'unknown');
  return message;
}

function requireQuoteReply(inbox: QuoteInbox): CorrelatedAgentMessage {
  const quoteReply = inbox.getReply();
  if (quoteReply === undefined) {
    throw new Error('Bob did not answer Alice quote request.');
  }

  return quoteReply;
}

/** Builds the final swap action after Alice accepts Bob's quote. */
function createSwapActionFromQuote(
  goal: RebalanceGoal,
  quoteReply: CorrelatedAgentMessage,
  offeredOutputPerInput: number,
) {
  return createActionIntent({
    type: 'swap',
    amount: goal.amount,
    metadata: {
      assetPair: goal.assetPair,
      venue: goal.venue,
      quoteId: quoteReply.id,
      offeredOutputPerInput,
      reason: 'portfolio drift exceeded threshold and Bob quote is acceptable',
    },
  });
}

/** Installs Carol's proof-backed result verifier. */
function installCarolVerifiedResultListener(stats: ScenarioStats): void {
  carol.onVerifiedMessage(proof, {
    onTrusted(result) {
      logDetail('Carol trusted message', `${result.message.type} from ${result.message.sender}`);
      stats.carolTrustedMessages.push({
        verifier: carol.identity.id,
        acceptedFrom: result.message.sender,
        actionType: result.message.payload.action,
        proofFormat: result.proof.format,
        verification: result.verification,
      });
    },
    onRejected(result) {
      logDetail('Carol rejected message', `${result.message.type} from ${result.message.sender}: ${result.reason}`);
      stats.carolRejectedMessages.push({
        verifier: carol.identity.id,
        rejectedFrom: result.message.sender,
        reason: result.reason,
      });
    },
  });
}

/** Creates Alice's trusted runtime for the final proof-backed execution request. */
function createAliceRuntime(rebalanceAction: ReturnType<typeof createActionIntent>, stats: ScenarioStats) {
  return createTrustedAgent({
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
    // bob is modeled as a verifying executor: he receives alice's request, checks
    // the proof/public inputs, and only then returns a mock uniswap receipt.
    execution: localVerifyingExecution(
      proof,
      async ({ identity, action, proof }) => {
        logDetail('Bob received execution request', `${action.type} ${String(action.amount)}`);

        const review = {
          executor: bob.id,
          requester: identity.id,
          quoteId: action.metadata?.quoteId,
          checked: ['proof-verification', 'agentId', 'policyHash', 'actionType'],
          decision: 'execute-mock-uniswap-order',
        };
        stats.bobExecutionReviews.push(review);
        logDetail('Bob verified execution proof', 'agentId, policyHash, actionType');
        logDetail('Bob executes mock swap', `${String(action.metadata?.assetPair)} amount ${String(action.amount)}`);

        return {
          success: true,
          reference: `mock-uniswap-receipt:${proof.publicInputs.policyHash}:${action.type}`,
          details: {
            executor: bob.id,
            venue: action.metadata?.venue,
            assetPair: action.metadata?.assetPair,
            amount: action.amount,
            quoteId: action.metadata?.quoteId,
            review,
          },
        };
      },
    ),
    now: () => new Date('2026-04-25T12:00:02.000Z'),
    createEventId: () => 'event-alice-rebalance-1',
  });
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

function readNumberPayload(message: CorrelatedAgentMessage, key: string): number {
  const value = message.payload[key];
  if (typeof value !== 'number') {
    throw new TypeError(`Expected numeric payload field ${key}.`);
  }

  return value;
}
