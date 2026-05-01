import {
  createAgentIdentity,
  createAgentRuntime,
  createPolicy,
  hashPolicy,
  issueLocalCredential,
  llmReasoningEngine,
  localDelegationSigner,
  localNoirProofs,
  localOgStorage,
  localVerifyingExecution,
  mockLlmClient,
  verifyLocalDelegation,
} from '@0xagentio/sdk';

/**
 * Demonstrates an optional deterministic guard after LLM reasoning.
 *
 * The mock LLM proposes an oversized but otherwise well-formed swap. A
 * developer-defined guard rewrites the amount to the app's deterministic risk
 * limit before the normal runtime validates policy, proves, stores, and
 * executes the action.
 */

const now = new Date('2026-04-30T12:00:00.000Z');

logTitle('0xAgentio guarded LLM reasoning flow');
logStep('Value prop');
logDetail(
  'What this demonstrates',
  'LLM output can be checked or rewritten by deterministic app logic before policy/proof enforcement',
);

logStep('1. Create delegated Alice');
const aliceIdentity = createAgentIdentity({
  id: 'agent-alice-guarded-llm',
  publicKey: 'agent-public-key-alice-guarded-llm',
});
const policy = createPolicy({
  id: 'policy-guarded-llm-rebalance',
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
  identity: aliceIdentity,
  policy,
  id: 'credential-alice-guarded-llm',
  issuedAt: now,
  signer: localDelegationSigner('principal-guarded-llm-demo'),
});
logDetail('Alice', aliceIdentity.id);
logDetail('Policy max amount', '500');
logDetail('App guard max amount', '250');
logDetail('Policy commitment', policyHash);

logStep('2. Create a mock LLM that proposes too much');
const llm = mockLlmClient(() =>
  JSON.stringify({
    decision: 'act',
    action: {
      type: 'swap',
      amount: '700',
      metadata: {
        assetPair: 'ETH/USDC',
        venue: 'uniswap-demo',
        reason: 'Model wants to fully rebalance in one trade.',
      },
    },
    reason: 'Quote is attractive, so swap aggressively.',
  }),
);

logStep('3. Add a deterministic guard that caps the model output');
const appMaxAmount = 250n;
const reasoning = llmReasoningEngine({
  client: llm,
  goal: 'Rebalance ETH/USDC when the quote is attractive.',
  allowedActionTypes: ['swap'],
  guard: ({ decision }) => {
    if (decision.decision === 'skip') {
      return decision;
    }

    const proposedAmount = decision.action.amount ?? 0n;
    logDetail('LLM proposed amount', String(proposedAmount));
    if (proposedAmount <= appMaxAmount) {
      return decision;
    }

    logDetail('Guard rewrite', `${String(proposedAmount)} -> ${String(appMaxAmount)}`);
    return {
      ...decision,
      action: {
        ...decision.action,
        amount: appMaxAmount,
        metadata: {
          ...decision.action.metadata,
          guardReason: 'app-level max amount cap',
          originalLlmAmount: proposedAmount.toString(),
        },
      },
    };
  },
});

logStep('4. Run Alice through the normal trusted runtime');
const proof = localNoirProofs();
const storage = localOgStorage();
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
      'Execution adapter verified',
      `${proof.publicInputs.agentId} may ${proof.publicInputs.actionType}`,
    );

    return {
      success: true,
      reference: `mock-uniswap-receipt:${proof.publicInputs.policyHash}:${action.type}`,
      details: {
        assetPair: action.metadata?.assetPair,
        amount: action.amount,
        guardReason: action.metadata?.guardReason,
      },
    };
  }),
  now: () => now,
  createEventId: () => 'audit-event-guarded-llm-1',
});
const result = await alice.startOnce();
if (result.status !== 'accepted') {
  throw new Error(`Expected accepted action, got ${result.status}.`);
}
logDetail('Runtime result', result.status);
logDetail('Final proved amount', String(result.action.amount));
logDetail('Execution receipt', result.execution?.reference ?? 'none');

logStep('5. Inspect persisted state and audit trail');
const latestState = await alice.loadState();
logDetail('Cumulative spend', String(latestState.cumulativeSpend));
logDetail('0G-shaped records', String(storage.getRecords().length));
logDetail('Audit events', String(storage.getAuditEvents().length));

logStep('Outcome');
logDetail(
  'Why it matters',
  'the model can suggest, the guard can constrain, and the runtime still enforces proof-bound authority',
);

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
