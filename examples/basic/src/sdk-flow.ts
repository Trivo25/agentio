import {
  createActionIntent,
  createAgentIdentity,
  createPolicy,
  createTrustedAgent,
  hashPolicy,
  issueLocalCredential,
  localDelegationSigner,
  verifyLocalDelegation,
  localExecution,
  localMemoryStorage,
  localPolicyProofs,
  staticReasoningEngine,
  type AgentStepResult,
} from '@0xagentio/sdk';

/**
 * Demonstrates the lower-level trusted-agent API.
 *
 * This example is useful when a developer wants direct control over one local
 * decision/proof/execution cycle without peer messaging. Most applications can
 * start with `createAgentRuntime`; this lower-level helper remains available
 * when the app wants to own communication or orchestration separately.
 */

logTitle('0xAgentio trusted-agent flow');

logStep('Creating Alice identity');
const identity = createAgentIdentity({
  id: 'agent-alice',
  publicKey: 'agent-public-key-alice',
});
logDetail('Alice', identity.id);

logStep('Creating delegated policy and credential');
const policy = createPolicy({
  id: 'policy-basic',
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
logDetail('Policy commitment', policyHash);

const credential = await issueLocalCredential({
  identity,
  policy,
  id: 'credential-basic',
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
  signer: localDelegationSigner('principal-alice'),
});
logDetail('Credential', credential.id);

logStep('Creating Alice action');
const action = createActionIntent({
  type: 'swap',
  amount: 250n,
  metadata: { assetPair: 'ETH/USDC' },
});
logDetail(
  'Action',
  `${action.type} ${String(action.amount)} ${String(action.metadata?.assetPair)}`,
);

logStep('Creating lower-level trusted agent');
const storage = localMemoryStorage();
const agent = createTrustedAgent({
  identity,
  credential,
  policy,
  initialState: {
    cumulativeSpend: 0n,
    updatedAt: new Date('2026-04-25T00:00:00.000Z'),
  },
  reasoning: staticReasoningEngine(action),
  delegationVerifier: verifyLocalDelegation,
  proof: localPolicyProofs(),
  storage,
  execution: localExecution(async ({ action }) => ({
    success: true,
    reference: `local-execution:${action.type}`,
    details: { assetPair: action.metadata?.assetPair, amount: action.amount },
  })),
  now: () => new Date('2026-04-25T12:00:00.000Z'),
  createEventId: () => 'event-sdk-flow-1',
});

logStep('Running one decision cycle');
const result = await agent.startOnce();
logDetail('Decision result', describeResult(result));
logDetail('Audit events', String(storage.getAuditEvents().length));

/** Returns a readable one-line description for the trusted-agent result. */
function describeResult(result: AgentStepResult): string {
  if (result.status === 'accepted') {
    return `accepted ${result.action.type} with ${result.proof.format}`;
  }

  if (result.status === 'rejected') {
    return `rejected with ${result.validation.issues.length} issue(s)`;
  }

  return 'skipped';
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
