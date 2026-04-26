import {
  createActionIntent,
  createAgentIdentity,
  createAgentMessage,
  createAgentPeer,
  createAgentReply,
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
  verifyCredentialMessage,
  verifyLocalDelegation,
} from '@0xagentio/sdk';

/**
 * Demonstrates a small local multi-agent stack.
 *
 * Alice is a delegated portfolio agent. Bob is a Uniswap-shaped executor agent
 * that can answer quote requests and later verify Alice's proof before mock
 * execution. Carol is an auditor agent that only trusts proof-backed messages.
 */

logTitle('0xAgentio local multi-agent stack');

/** Principal that owns the treasury policy and delegates bounded authority to Alice. */
const principalId = 'principal-treasury';

logStep('Creating agents');
logDetail('Principal', principalId);

/** Alice is the autonomous agent that receives delegated authority. */
const alice = createAgentIdentity({
  id: 'agent-alice-rebalancer',
  publicKey: 'agent-public-key-alice-rebalancer',
});
logDetail('Created Alice', alice.id);

/** Bob represents an external executor agent for the future Uniswap adapter. */
const bob = createAgentIdentity({
  id: 'agent-bob-uniswap-executor',
  publicKey: 'agent-public-key-bob-uniswap-executor',
});
logDetail('Created Bob', bob.id);

/** Carol represents a separate auditor/listener agent. */
const carolIdentity = createAgentIdentity({
  id: 'agent-carol-auditor',
  publicKey: 'agent-public-key-carol-auditor',
});
logDetail('Created Carol', carolIdentity.id);

logStep('Creating delegated policy');

/** Policy limiting what Alice may request, regardless of what her reasoning layer proposes. */
const policy = createPolicy({
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

/** Policy hash is the commitment Bob and other verifiers can compare against the proof. */
const policyHash = hashPolicy(policy);
logDetail('Allowed actions', policy.allowedActions.join(', '));
logDetail('Policy commitment', policyHash);

/** Credential binds Alice to the delegated policy and carries the principal's signature. */
const credential = await issueLocalCredential({
  identity: alice,
  policy,
  id: 'credential-alice-treasury-rebalance',
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
  signer: localDelegationSigner(principalId),
});
logDetail('Issued credential', `${credential.id} -> ${credential.agentId}`);

logStep('Defining Alice goal');
const rebalanceGoal = {
  assetPair: 'ETH/USDC',
  venue: 'uniswap-demo',
  amount: 250n,
  targetOutputPerInput: 2,
  minimumAcceptableOutputPerInput: 2,
};
logDetail('Goal', `swap ${String(rebalanceGoal.amount)} ${rebalanceGoal.assetPair} on ${rebalanceGoal.venue}`);
logDetail('Target', `1:${rebalanceGoal.targetOutputPerInput} or better`);

logStep('Creating local adapters');

/** Noir-shaped proof adapter used by Alice and independently checked by Bob. */
const proof = localNoirProofs();
/** 0G-shaped local storage records Alice's state and audit trail. */
const storage = localOgStorage();
/** AXL-shaped local transport carries messages between agents. */
const transport = localAxlTransport('agentio/rebalance-signals');
logDetail('Proof adapter', 'local Noir-shaped proofs');
logDetail('Storage adapter', 'local 0G-shaped storage');
logDetail('Transport adapter', 'local AXL-shaped topic agentio/rebalance-signals');

logStep('Creating peer listeners');
const alicePeer = createAgentPeer({ identity: alice, transport });
const bobPeer = createAgentPeer({ identity: bob, transport });
const carol = createAgentPeer({ identity: carolIdentity, transport });
logDetail('Alice listens for', 'Bob quote replies');
logDetail('Bob listens for', 'proof-backed quote requests');
logDetail('Carol listens for', 'proof-backed execution announcements');

const bobQuoteResponses: unknown[] = [];
const bobQuoteProofChecks: unknown[] = [];
const bobRejectedQuoteRequests: unknown[] = [];
const bobExecutionReviews: unknown[] = [];
const carolTrustedMessages: unknown[] = [];
const carolRejectedMessages: unknown[] = [];
let quoteReply: CorrelatedAgentMessage | undefined;

/** Alice listens for Bob's quote reply before deciding what action to prove. */
alicePeer.onMessage((message) => {
  if (message.type === 'swap-quote-reply' && message.sender === bob.id) {
    quoteReply = message as CorrelatedAgentMessage;
    logDetail('Alice received quote reply', `${quoteReply.id} replying to ${quoteReply.replyTo}`);
  }
});

/** Bob listens for quote requests, verifies authorization, and answers with a mock quote. */
bobPeer.onMessage(async (message) => {
  if (message.type !== 'swap-quote-request' || message.sender !== alice.id) {
    return;
  }

  logDetail('Bob received quote request', message.id ?? message.type);

  const verification = await verifyCredentialMessage(message, proof);
  const quoteActionType = verification.valid ? verification.proof.publicInputs.actionType : undefined;
  const quoteAgentId = verification.valid ? verification.proof.publicInputs.agentId : undefined;
  const quotePolicyHash = verification.valid ? verification.proof.publicInputs.policyHash : undefined;
  const quoteAuthorized =
    verification.valid &&
    quoteActionType === 'request-quote' &&
    quoteAgentId === alice.id &&
    quotePolicyHash === policyHash;

  bobQuoteProofChecks.push({
    requester: message.sender,
    valid: quoteAuthorized,
    actionType: quoteActionType,
    agentId: quoteAgentId,
    policyHash: quotePolicyHash,
  });

  logDetail('Bob verified quote proof', quoteAuthorized ? 'accepted request-quote proof' : 'rejected quote request');

  if (!quoteAuthorized) {
    bobRejectedQuoteRequests.push({
      requester: message.sender,
      reason: verification.valid ? 'proof-public-input-mismatch' : verification.reason,
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

  bobQuoteResponses.push(reply.payload);
  logDetail('Bob replies with quote', `1:${offeredOutputPerInput}`);
  await bobPeer.send(alice.id, reply);
  await transport.receive(reply);
});

logStep('Alice prepares a proof-backed quote request');

/** Alice proves she is authorized to ask Bob for this quote before Bob spends work on it. */
const quoteAction = createActionIntent({
  type: 'request-quote',
  amount: rebalanceGoal.amount,
  metadata: {
    assetPair: rebalanceGoal.assetPair,
    venue: rebalanceGoal.venue,
    targetOutputPerInput: rebalanceGoal.targetOutputPerInput,
  },
});

logDetail('Creating quote action', quoteAction.type);
const quoteProof = await proof.proveAction({
  credential,
  policy,
  state: {
    cumulativeSpend: 0n,
    updatedAt: new Date('2026-04-25T00:00:00.000Z'),
  },
  action: quoteAction,
  now: new Date('2026-04-25T12:00:00.000Z'),
});
logDetail('Generated quote proof', quoteProof.proof.format);

const quoteRequest = createAgentMessage({
  id: 'quote-request-1',
  correlationId: 'rebalance-session-1',
  type: 'swap-quote-request',
  sender: alice.id,
  createdAt: new Date('2026-04-25T12:00:00.000Z'),
  payload: {
    action: quoteAction,
    proof: quoteProof.proof,
    policyHash,
  },
});

logStep('Alice asks Bob for market/execution context');
logDetail('Sending quote request', `${quoteRequest.id} (${quoteRequest.correlationId})`);
await alicePeer.send(bob.id, quoteRequest);
logDetail('Waiting for Bob response', 'local transport delivery');
await transport.receive(quoteRequest);

if (quoteReply === undefined) {
  throw new Error('Bob did not answer Alice quote request.');
}

logStep('Alice reasons over Bob quote');
const offeredOutputPerInput = readNumberPayload(quoteReply, 'offeredOutputPerInput');
logDetail('Bob offered', `1:${offeredOutputPerInput}`);
const aliceAcceptsQuote = offeredOutputPerInput >= rebalanceGoal.minimumAcceptableOutputPerInput;

logDetail('Alice decision', aliceAcceptsQuote ? 'quote is acceptable' : 'quote is outside acceptable range');

if (!aliceAcceptsQuote) {
  throw new Error('Alice rejected Bob quote because it was outside her acceptable range.');
}

/** Action Alice wants to take after reasoning over Bob's quote reply. */
const rebalanceAction = createActionIntent({
  type: 'swap',
  amount: rebalanceGoal.amount,
  metadata: {
    assetPair: rebalanceGoal.assetPair,
    venue: rebalanceGoal.venue,
    quoteId: quoteReply.id,
    offeredOutputPerInput,
    reason: 'portfolio drift exceeded threshold and Bob quote is acceptable',
  },
});

logStep('Carol starts verified result listener');

/** Carol listens for final result messages and only trusts messages with valid proofs. */
carol.onVerifiedMessage(proof, {
  onTrusted(result) {
    logDetail('Carol trusted message', `${result.message.type} from ${result.message.sender}`);
    carolTrustedMessages.push({
      verifier: carol.identity.id,
      acceptedFrom: result.message.sender,
      actionType: result.message.payload.action,
      proofFormat: result.proof.format,
      verification: result.verification,
    });
  },
  onRejected(result) {
    logDetail('Carol rejected message', `${result.message.type} from ${result.message.sender}: ${result.reason}`);
    carolRejectedMessages.push({
      verifier: carol.identity.id,
      rejectedFrom: result.message.sender,
      reason: result.reason,
    });
  },
});

logStep('Creating Alice trusted runtime');

/**
 * Alice's runtime performs local checks before asking any external executor to act.
 */
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
      bobExecutionReviews.push(review);
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

logStep('Alice proves and requests execution');

/** Runs one Alice decision cycle: validate, prove, ask Bob to execute, and audit. */
const aliceResult = await agent.startOnce();
logDetail('Alice result', aliceResult.status);
if (aliceResult.status === 'accepted') {
  logDetail('Execution receipt', aliceResult.execution?.reference ?? 'none');
}

logStep('Alice announces final result to Carol');

// If Bob accepted execution, Alice broadcasts the proof-backed result to peers.
if (aliceResult.status === 'accepted') {
  const proofBackedMessage = createAgentMessage({
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

  logDetail('Sending proof-backed result', `${proofBackedMessage.id} -> ${carol.identity.id}`);
  await alicePeer.send(carol.identity.id, proofBackedMessage);
  await transport.receive(proofBackedMessage);
}

logStep('Mallory tries a spoofed result');

// Mallory sends the same shape of message without a proof; Carol should reject it.
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

const storageRecords = storage.getRecords();
const axlEnvelopes = transport.getEnvelopes();

logStep('Final outcome');
logDetail('Alice status', aliceResult.status);
logDetail('Execution receipt', aliceResult.status === 'accepted' ? aliceResult.execution?.reference ?? 'none' : 'none');
logDetail('0G-shaped records written', String(storageRecords.length));
logDetail('AXL-shaped messages sent', String(axlEnvelopes.length));
logDetail('Carol trusted/rejected', `${carolTrustedMessages.length}/${carolRejectedMessages.length}`);

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
