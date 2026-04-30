import {
  createActionIntent,
  createAgentIdentity,
  createAgentRuntime,
  createPolicy,
  hashPolicy,
  issueLocalCredential,
  localDelegationSigner,
  localNoirProofs,
  localOgStorage,
  localVerifyingExecution,
  staticRulesReasoningEngine,
  verifyLocalDelegation,
} from '@0xagentio/sdk';

/**
 * Demonstrates bounded multi-step execution with `runUntilComplete`.
 *
 * The agent uses deterministic static rules, not an LLM. Each cycle proposes
 * the next small swap until persisted state reaches the target spend. Every
 * step still validates policy, creates a proof, executes, and writes audit
 * state independently.
 */

const now = new Date('2026-04-30T12:00:00.000Z');

logTitle('0xAgentio runUntilComplete flow');
logStep('Value prop');
logDetail(
  'What this demonstrates',
  'agents can run bounded multi-step workflows without bypassing per-action proof and audit',
);

logStep('1. Create delegated Alice');
const aliceIdentity = createAgentIdentity({
  id: 'agent-alice-run-loop',
  publicKey: 'agent-public-key-alice-run-loop',
});
const policy = createPolicy({
  id: 'policy-run-loop',
  allowedActions: ['swap'],
  constraints: [
    { type: 'max-amount', value: 100n, actionTypes: ['swap'] },
    { type: 'max-cumulative-amount', value: 300n, actionTypes: ['swap'] },
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
  id: 'credential-alice-run-loop',
  issuedAt: now,
  signer: localDelegationSigner('principal-run-loop-demo'),
});
logDetail('Alice', aliceIdentity.id);
logDetail('Per-step max', '100');
logDetail('Target cumulative spend', '300');
logDetail('Policy commitment', policyHash);

logStep('2. Create deterministic static rules');
const reasoning = staticRulesReasoningEngine({
  rules: [
    ({ state }) => {
      if (state.cumulativeSpend >= 300n) {
        return 'skip';
      }

      return createActionIntent({
        type: 'swap',
        amount: 100n,
        metadata: {
          assetPair: 'ETH/USDC',
          reason: 'continue incremental rebalance until target is reached',
        },
      });
    },
  ],
});

logStep('3. Run bounded cycles until target state is reached');
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
      reference: `mock-rebalance-receipt:${proof.publicInputs.policyHash}:${action.amount?.toString() ?? '0'}`,
    };
  }),
  now: () => now,
  createEventId: () => `audit-event-run-loop-${crypto.randomUUID()}`,
});
const result = await alice.runUntilComplete({
  maxSteps: 5,
  stopWhen: ({ state }) => state.cumulativeSpend >= 300n,
});
logDetail('Run status', result.status);
logDetail('Steps completed', String(result.steps.length));
logDetail('Final cumulative spend', String(result.finalState.cumulativeSpend));
logDetail('Audit events', String(storage.getAuditEvents().length));

logStep('Outcome');
logDetail(
  'Why it matters',
  'multi-step agents still produce one validation, proof, execution, and audit trail per action',
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
