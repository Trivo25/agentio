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
  llmReasoningEngine,
  localDelegationSigner,
  localNoirProofs,
  localOgStorage,
  localVerifyingExecution,
  verifyLocalDelegation,
} from '@0xagentio/sdk';

/**
 * Runs dynamic reasoning through the 0G Compute Router.
 *
 * This opt-in example uses the real 0G Router OpenAI-compatible API for the
 * reasoning step, then keeps the normal AgentIO trust boundary: policy
 * validation, proof generation, state persistence, and verified execution still
 * happen locally after the model proposes an action.
 */

loadEnvFile();
const options = readOptions();
const now = new Date('2026-04-30T12:00:00.000Z');

logTitle('0xAgentio 0G Compute reasoning flow');
logStep('Checking 0G Compute Router configuration');
logDetail('Router base URL', options.baseUrl);
logDetail('Model', options.model);

logStep('Creating delegated Alice');
const aliceIdentity = createAgentIdentity({
  id: 'agent-alice-0g-compute',
  publicKey: 'agent-public-key-alice-0g-compute',
});
const policy = createPolicy({
  id: 'policy-0g-compute-rebalance',
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
  id: `credential-alice-0g-compute-${Date.now()}`,
  issuedAt: now,
  signer: localDelegationSigner('principal-0g-compute-demo'),
});
logDetail('Alice', aliceIdentity.id);
logDetail('Policy commitment', policyHash);

logStep('Creating 0G Compute LLM reasoning adapter');
const client = zeroGComputeRouterLlmClient({
  apiKey: options.apiKey,
  baseUrl: options.baseUrl,
  model: options.model,
  responseFormatStrategy: options.responseFormatStrategy,
});
const reasoning = llmReasoningEngine({
  client,
  goal: [
    'Return JSON only.',
    'A verified market agent quoted ETH/USDC at 1:3.',
    'If this meets the minimum 1:2 threshold, propose a swap for 250 units.',
  ].join(' '),
  instructions:
    'Only propose action type "swap". Use metadata assetPair="ETH/USDC" and venue="uniswap-demo".',
  allowedActionTypes: ['swap'],
});

logStep('Running one AgentIO cycle with real 0G Compute reasoning');
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
        venue: action.metadata?.venue,
        amount: action.amount,
      },
    };
  }),
  now: () => now,
  createEventId: () => `audit-event-0g-compute-${Date.now()}`,
});
const result = await alice.startOnce();
if (result.status !== 'accepted') {
  throw new Error(`Expected accepted action, got ${result.status}.`);
}
logDetail('Runtime result', result.status);
logDetail('0G Compute proposed', describeAction(result.action));
logDetail('Execution receipt', result.execution?.reference ?? 'none');

logStep('Inspecting persisted local state');
const latestState = await alice.loadState();
logDetail('Cumulative spend', String(latestState.cumulativeSpend));
logDetail('0G-shaped records', String(storage.getRecords().length));

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

  return {
    apiKey,
    model: process.env.AGENTIO_0G_COMPUTE_MODEL ?? 'zai-org/GLM-5-FP8',
    baseUrl:
      process.env.AGENTIO_0G_COMPUTE_BASE_URL ??
      ZERO_G_COMPUTE_ROUTER_TESTNET_BASE_URL,
    responseFormatStrategy:
      process.env.AGENTIO_0G_COMPUTE_RESPONSE_FORMAT === 'prompt-only'
        ? 'prompt-only'
        : 'openai-json-object',
  };
}

function describeAction(action: ReturnType<typeof createActionIntent>): string {
  return `${action.type} ${String(action.amount ?? 0n)} ${String(action.metadata?.assetPair ?? '')}`;
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
