import { existsSync, readFileSync } from 'node:fs';

import {
  ZERO_G_COMPUTE_ROUTER_TESTNET_BASE_URL,
  zeroGComputeRouterLlmClient,
} from '@0xagentio/compute';
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
  verifyLocalDelegation,
} from '@0xagentio/sdk';

/**
 * Runs a bounded multi-step agent loop with 0G Compute as the reasoning layer.
 *
 * The example shows the shape of a useful autonomous agent: the model proposes
 * one small action at a time, deterministic guard code keeps each proposal in
 * the app's safety envelope, and `runUntilComplete` repeats the normal AgentIO
 * validation/proof/execution/audit lifecycle until persisted state reaches the
 * target.
 */

loadEnvFile();
const options = readOptions();
const now = new Date('2026-04-30T12:00:00.000Z');
const targetSpend = 300n;
const stepAmount = 100n;

logTitle('0xAgentio 0G Compute runUntilComplete flow');
logStep('Checking 0G Compute Router configuration');
logDetail('Router base URL', options.baseUrl);
logDetail('Model', options.model);
logDetail('Response format strategy', options.responseFormatStrategy);

logStep('1. Create delegated Alice');
const aliceIdentity = createAgentIdentity({
  id: 'agent-alice-0g-compute-loop',
  publicKey: 'agent-public-key-alice-0g-compute-loop',
});
const policy = createPolicy({
  id: 'policy-0g-compute-loop',
  allowedActions: ['swap'],
  constraints: [
    { type: 'max-amount', value: stepAmount, actionTypes: ['swap'] },
    { type: 'max-cumulative-amount', value: targetSpend, actionTypes: ['swap'] },
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
  id: `credential-alice-0g-compute-loop-${Date.now()}`,
  issuedAt: now,
  signer: localDelegationSigner('principal-0g-compute-loop-demo'),
});
logDetail('Alice', aliceIdentity.id);
logDetail('Per-step max', stepAmount.toString());
logDetail('Target cumulative spend', targetSpend.toString());
logDetail('Policy commitment', policyHash);

logStep('2. Create 0G Compute reasoning with a deterministic guard');
const client = zeroGComputeRouterLlmClient({
  apiKey: options.apiKey,
  baseUrl: options.baseUrl,
  model: options.model,
  responseFormatStrategy: options.responseFormatStrategy,
});
const reasoning = llmReasoningEngine({
  client,
  goal: [
    'Run an incremental ETH/USDC rebalance until cumulativeSpend reaches 300.',
    'Return one action per decision cycle, not the whole plan.',
    'If cumulativeSpend is already 300 or higher, return {"decision":"skip"}.',
    'Otherwise propose {"decision":"act","action":{"type":"swap","amount":"100","metadata":{"assetPair":"ETH/USDC","venue":"uniswap-demo"}}}.',
  ].join(' '),
  instructions:
    'Return strict JSON only. Use decimal strings for amounts. Do not propose actions other than swap.',
  allowedActionTypes: ['swap'],
  guard: ({ decision, context }) => guardRebalanceDecision(decision, context.state.cumulativeSpend),
  onDecision: ({ rawDecision, decision }) => {
    logDecisionTrace(rawDecision, decision);
  },
});
logDetail(
  'Guard purpose',
  'normalizes model output to one safe 100-unit ETH/USDC swap or skip when complete',
);

logStep('3. Run bounded cycles until Alice reaches the target');
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
  createEventId: () => `audit-event-0g-compute-loop-${crypto.randomUUID()}`,
});
const result = await alice.runUntilComplete({
  maxSteps: 5,
  timeoutMs: 60_000,
  stopWhen: ({ state }) => state.cumulativeSpend >= targetSpend,
});

logStep('4. Inspect the completed run');
logDetail('Run status', result.status);
logDetail('Steps completed', String(result.steps.length));
logDetail('Accepted actions', String(result.steps.filter((step) => step.status === 'accepted').length));
logDetail('Final cumulative spend', String(result.finalState.cumulativeSpend));
logDetail('0G-shaped state records', String(storage.getRecords().length));
logDetail('Audit events', String(storage.getAuditEvents().length));

logStep('Outcome');
logDetail(
  'What this proves',
  '0G Compute can drive repeated reasoning cycles while AgentIO keeps every action separately validated, proved, executed, and audited',
);

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

type Options = {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly responseFormatStrategy: 'openai-json-object' | 'prompt-only';
};

function readOptions(): Options {
  const apiKey = process.env.AGENTIO_0G_COMPUTE_API_KEY;
  if (apiKey === undefined || apiKey === '') {
    throw new Error('Missing AGENTIO_0G_COMPUTE_API_KEY.');
  }
  const model = process.env.AGENTIO_0G_COMPUTE_MODEL;
  if (model === undefined || model === '') {
    throw new Error('Missing AGENTIO_0G_COMPUTE_MODEL.');
  }

  return {
    apiKey,
    model,
    baseUrl:
      process.env.AGENTIO_0G_COMPUTE_BASE_URL ??
      ZERO_G_COMPUTE_ROUTER_TESTNET_BASE_URL,
    responseFormatStrategy:
      process.env.AGENTIO_0G_COMPUTE_RESPONSE_FORMAT === 'openai-json-object'
        ? 'openai-json-object'
        : 'prompt-only',
  };
}

function loadEnvFile(path = '.env'): void {
  if (!existsSync(path)) {
    return;
  }

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const entry = parseEnvLine(line);
    if (entry !== undefined && process.env[entry.key] === undefined) {
      process.env[entry.key] = entry.value;
    }
  }
}

function parseEnvLine(
  line: string,
): { readonly key: string; readonly value: string } | undefined {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('#')) {
    return undefined;
  }

  const separator = trimmed.indexOf('=');
  if (separator === -1) {
    return undefined;
  }

  const key = trimmed.slice(0, separator).trim();
  if (!/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(key)) {
    return undefined;
  }

  return { key, value: unquoteEnvValue(trimmed.slice(separator + 1).trim()) };
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
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
  console.log(`\n▶ ${message}`);
}

function logDetail(label: string, value: string): void {
  console.log(`  - ${label}: ${value}`);
}
