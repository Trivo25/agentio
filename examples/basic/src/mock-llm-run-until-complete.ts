import {
  createActionIntent,
  createAgentIdentity,
  createAgentRuntime,
  createPolicy,
  hashPolicy,
  issueLocalCredential,
  type LlmReasoningDecision,
  llmReasoningEngine,
  localDelegationSigner,
  localNoirProofs,
  localOgStorage,
  localVerifyingExecution,
  mockLlmClient,
  verifyLocalDelegation,
} from '@0xagentio/sdk';

/**
 * Demonstrates a CI-safe multi-step LLM agent loop.
 *
 * The mock model intentionally returns realistic but imperfect provider output.
 * A deterministic guard turns those suggestions into the next safe step, then
 * `runUntilComplete` repeats the normal validation, proof, execution, storage,
 * and audit lifecycle until the agent reaches its target state.
 */

const now = new Date('2026-04-30T12:00:00.000Z');
const targetSpend = 300n;
const stepAmount = 100n;

logTitle('0xAgentio mocked LLM runUntilComplete flow');
logStep('Value prop');
logDetail(
  'What this demonstrates',
  'LLMs can provide flexible decisions while deterministic guards and AgentIO runtime enforcement keep every step bounded',
);

logStep('1. Create delegated Alice');
const aliceIdentity = createAgentIdentity({
  id: 'agent-alice-mock-llm-loop',
  publicKey: 'agent-public-key-alice-mock-llm-loop',
});
const policy = createPolicy({
  id: 'policy-mock-llm-loop',
  allowedActions: ['swap'],
  constraints: [
    { type: 'max-amount', value: stepAmount, actionTypes: ['swap'] },
    {
      type: 'max-cumulative-amount',
      value: targetSpend,
      actionTypes: ['swap'],
    },
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
  id: 'credential-alice-mock-llm-loop',
  issuedAt: now,
  signer: localDelegationSigner('principal-mock-llm-loop-demo'),
});
logDetail('Alice', aliceIdentity.id);
logDetail('Per-step max', stepAmount.toString());
logDetail('Target cumulative spend', targetSpend.toString());
logDetail('Policy commitment', policyHash);

logStep('2. Create a mock LLM with imperfect multi-step output');
let llmCall = 0;
const llm = mockLlmClient(() => {
  llmCall += 1;
  const response = mockProviderResponse(llmCall);
  logDetail('Mock LLM response', response.description);
  return JSON.stringify(response.body);
});

logStep('3. Add a deterministic guard for stable authorization amounts');
const reasoning = llmReasoningEngine({
  client: llm,
  goal: 'Incrementally rebalance ETH/USDC until cumulative spend reaches 300.',
  instructions:
    'Return one swap action at a time with metadata assetPair="ETH/USDC" and venue="uniswap-demo".',
  allowedActionTypes: ['swap'],
  guard: ({ decision, context }) =>
    guardRebalanceDecision(decision, context.state.cumulativeSpend),
  onDecision: ({ rawDecision, decision }) => {
    logDecisionTrace(rawDecision, decision);
  },
});
logDetail(
  'Guard purpose',
  'keeps model output to the next safe 100-unit ETH/USDC swap and skips when the target is complete',
);

logStep('4. Run Alice until the persisted target state is reached');
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
      `${proof.publicInputs.agentId} may ${proof.publicInputs.actionType} ${String(action.amount)}`,
    );

    return {
      success: true,
      reference: `mock-uniswap-receipt:${proof.publicInputs.policyHash}:${String(action.amount)}`,
      details: {
        assetPair: action.metadata?.assetPair,
        venue: action.metadata?.venue,
        amount: action.amount,
      },
    };
  }),
  now: () => now,
  createEventId: () => `audit-event-mock-llm-loop-${crypto.randomUUID()}`,
});
const result = await alice.runUntilComplete({
  maxSteps: 5,
  stopWhen: ({ state }) => state.cumulativeSpend >= targetSpend,
});

logStep('5. Inspect the completed run');
logDetail('Run status', result.status);
logDetail('Steps completed', String(result.steps.length));
logDetail(
  'Accepted actions',
  String(result.steps.filter((step) => step.status === 'accepted').length),
);
logDetail('Final cumulative spend', String(result.finalState.cumulativeSpend));
logDetail('0G-shaped state records', String(storage.getRecords().length));
logDetail('Audit events', String(storage.getAuditEvents().length));

if (
  result.status !== 'stopped' ||
  result.finalState.cumulativeSpend !== targetSpend
) {
  throw new Error(
    `Expected stopped at ${targetSpend}, got ${result.status} at ${result.finalState.cumulativeSpend}.`,
  );
}

logStep('Outcome');
logDetail(
  'Why it matters',
  'this local example locks the same agent-loop behavior as the live 0G Compute example without needing network credentials',
);

type MockProviderResponse = {
  readonly description: string;
  readonly body: Readonly<Record<string, unknown>>;
};

function mockProviderResponse(call: number): MockProviderResponse {
  if (call === 1) {
    return {
      description: 'amount as JSON number',
      body: {
        decision: 'act',
        action: {
          type: 'swap',
          amount: 100,
          metadata: { assetPair: 'ETH/USDC', venue: 'uniswap-demo' },
        },
      },
    };
  }

  if (call === 2) {
    return {
      description: 'amount as integer-looking decimal string',
      body: {
        decision: 'act',
        action: {
          type: 'swap',
          amount: '100.0',
          metadata: { assetPair: 'ETH/USDC', venue: 'uniswap-demo' },
        },
      },
    };
  }

  return {
    description: 'oversized amount that the guard normalizes',
    body: {
      decision: 'act',
      action: {
        type: 'swap',
        amount: '250',
        metadata: {
          assetPair: 'ETH/USDC',
          venue: 'uniswap-demo',
          modelReason: 'finish the rebalance quickly',
        },
      },
    },
  };
}

function guardRebalanceDecision(
  decision: LlmReasoningDecision,
  cumulativeSpend: bigint,
): LlmReasoningDecision {
  if (cumulativeSpend >= targetSpend) {
    return { decision: 'skip', reason: 'target cumulative spend reached' };
  }

  const remaining = targetSpend - cumulativeSpend;
  const amount = remaining < stepAmount ? remaining : stepAmount;

  return {
    decision: 'act',
    action: createActionIntent({
      type: 'swap',
      amount,
      metadata: {
        assetPair: 'ETH/USDC',
        venue: 'uniswap-demo',
        reason: 'continue incremental rebalance until target is reached',
      },
    }),
    reason: 'deterministic guard selected the next safe rebalance step',
  };
}

function logDecisionTrace(
  rawDecision: LlmReasoningDecision,
  decision: LlmReasoningDecision,
): void {
  const raw = describeDecision(rawDecision);
  const guarded = describeDecision(decision);

  if (raw === guarded) {
    logDetail('Guard accepted model decision', guarded);
    return;
  }

  logDetail('Guard adjusted model decision', `${raw} -> ${guarded}`);
}

function describeDecision(decision: LlmReasoningDecision): string {
  if (decision.decision === 'skip') {
    return 'skip';
  }

  return `${decision.action.type} ${String(decision.action.amount ?? 0n)}`;
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
