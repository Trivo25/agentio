import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createActionIntent,
  createAgentIdentity,
  createPolicy,
  createTrustedAgent,
  hashPolicy,
  issueLocalCredential,
  localDelegationSigner,
  localNoirProofs,
  localVerifyingExecution,
  staticReasoningEngine,
  verifyLocalDelegation,
} from '@0xagentio/sdk';
import {
  anchorProofOn0G,
  createLocalAnchorProofReceipt,
  createProofBundle,
  hashJson,
  localProofBundleObjectClient,
  ogFileObjectClient,
  ogStorage,
  uploadProofBundleTo0G,
  type AnchorProofOn0GResult,
  type OgObjectClient,
  type ProofBundle,
} from '@0xagentio/og';

type PassportArtifact = {
  readonly title: string;
  readonly task: {
    readonly id: string;
    readonly description: string;
    readonly inputHash: string;
  };
  readonly agent: {
    readonly id: string;
    readonly owner: string;
    readonly frameworkVersion: string;
  };
  readonly verification: {
    readonly verdict: string;
    readonly proofHash: string;
    readonly traceHash?: string;
    readonly outputHash: string;
    readonly policyHash?: string;
  };
  readonly storage: {
    readonly root: string;
    readonly uri?: string;
  };
  readonly chain: {
    readonly contractAddress: string;
    readonly proofId?: string;
    readonly transactionHash: string;
    readonly explorerLink?: string;
  };
  readonly compute: {
    readonly model: string;
    readonly provider: string;
    readonly status: string;
  };
  readonly proofBundle: ProofBundle;
};

const TASK_ID = 'agentproof-demo-contract-review';
const TASK_DESCRIPTION =
  'Review a delegated-agent execution policy and produce a bounded verification receipt.';
const OWNER_WALLET = env('AGENTPROOF_OWNER_WALLET') ?? '0xOwnerWalletPreview';
const FRAMEWORK_VERSION = '0.1.0';
const CREATED_AT = new Date('2026-05-12T00:00:00.000Z');

const input = {
  task: TASK_DESCRIPTION,
  document: {
    name: 'Treasury Agent Review Policy',
    clauses: [
      'Agent may review policy text and emit a structured report.',
      'Agent may not execute external transactions in this demo.',
      'Every accepted action must carry a proof-bound audit record.',
    ],
  },
};

const identity = createAgentIdentity({
  id: 'agentproof-verifier-agent',
  publicKey: 'agentproof-verifier-agent-public-key',
});

const action = createActionIntent({
  type: 'review_contract',
  amount: 1n,
  metadata: {
    taskKind: 'contract-review',
    evidenceRequired: true,
  },
});

const policy = createPolicy({
  id: 'agentproof-review-policy',
  allowedActions: ['review_contract'],
  constraints: [
    { type: 'max-amount', value: 1n, actionTypes: ['review_contract'] },
    {
      type: 'allowed-metadata-value',
      key: 'taskKind',
      values: ['contract-review'],
      actionTypes: ['review_contract'],
    },
    {
      type: 'allowed-metadata-value',
      key: 'evidenceRequired',
      values: [true],
      actionTypes: ['review_contract'],
    },
  ],
  expiresAt: new Date('2026-12-31T00:00:00.000Z'),
});

const credential = await issueLocalCredential({
  identity,
  policy,
  id: 'agentproof-review-credential',
  issuedAt: CREATED_AT,
  signer: localDelegationSigner('principal-agentproof-demo'),
});

const proofAdapter = localNoirProofs();
const objectClient = createProofObjectClient();
const storage = ogStorage({ namespace: 'agentproof-demo', client: objectClient });
const agent = createTrustedAgent({
  identity,
  credential,
  policy,
  initialState: {
    cumulativeSpend: 0n,
    updatedAt: CREATED_AT,
  },
  reasoning: staticReasoningEngine(action),
  proof: proofAdapter,
  storage,
  delegationVerifier: verifyLocalDelegation,
  execution: localVerifyingExecution(proofAdapter, async (request) => ({
    success: true,
    reference: `agentproof:${request.action.type}:${TASK_ID}`,
    details: {
      report: {
        summary: 'Policy-constrained agent action verified and accepted.',
        findings: [
          'Delegation signature is valid.',
          'Action type is allowed by policy.',
          'Proof public inputs bind the action, policy and agent id.',
        ],
      },
    },
  })),
  now: () => CREATED_AT,
  createEventId: () => 'event-agentproof-demo-1',
});

console.log('Running AgentProof demo task...');
const result = await agent.startOnce();
if (result.status !== 'accepted') {
  throw new Error(`AgentProof demo expected an accepted action, received ${result.status}.`);
}

const verifier = await proofAdapter.verifyProof(result.proof);
const output = {
  execution: result.execution,
  auditEvent: result.event,
  verifier,
};
const trace = {
  taskId: TASK_ID,
  action: result.action,
  validation: result.validation,
  proofPublicInputs: result.proof.publicInputs,
  auditEventId: result.event.id,
};

const initialBundle = createProofBundle({
  framework: 'AgentProof',
  version: FRAMEWORK_VERSION,
  agentId: identity.id,
  owner: OWNER_WALLET,
  taskId: TASK_ID,
  taskDescription: TASK_DESCRIPTION,
  input,
  policyHash: hashPolicy(policy),
  trace,
  output,
  proof: result.proof,
  verifierResult: verifier.valid ? 'pass' : 'fail',
  model: env('AGENTPROOF_MODEL') ?? 'deterministic-local-agent',
  computeProvider: env('AGENTPROOF_COMPUTE_PROVIDER') ?? 'local deterministic runtime',
  createdAt: CREATED_AT,
});

const uploaded = await uploadProofBundleTo0G(initialBundle, {
  client: objectClient,
  namespace: 'agentproof-demo',
});
const chainReceipt = await anchorProof(uploaded.bundle);
const proofBundle = {
  ...uploaded.bundle,
  chain_tx: chainReceipt.txHash,
  contract_address: chainReceipt.contractAddress,
  proof_id: chainReceipt.proofId,
  explorer_link: chainReceipt.explorerLink,
};
const artifact = toPassportArtifact(proofBundle, uploaded.uri, chainReceipt);

await writeJson(new URL('../../../landing/agentproof-passport-data.json', import.meta.url), artifact);
await writeJsData(new URL('../../../landing/agentproof-passport-data.js', import.meta.url), artifact);

console.log('AgentProof Verification Passport');
console.log(JSON.stringify(artifact, null, 2));

function createProofObjectClient(): OgObjectClient {
  if (env('AGENTPROOF_0G_LIVE_STORAGE') !== '1') {
    return localProofBundleObjectClient();
  }

  const evmRpc = requiredEnv('AGENTPROOF_0G_EVM_RPC');
  const indexerRpc = requiredEnv('AGENTPROOF_0G_INDEXER_RPC');
  const privateKey = requiredEnv('AGENTPROOF_0G_PRIVATE_KEY');

  return ogFileObjectClient({
    evmRpc,
    indexerRpc,
    privateKey,
    finalityRequired: env('AGENTPROOF_0G_FINALITY_REQUIRED') === '1',
    logSyncTimeoutMs: optionalNumberEnv('AGENTPROOF_0G_LOG_SYNC_TIMEOUT_MS'),
    onProgress: (message) => console.log(`[0G Storage] ${message}`),
  });
}

async function anchorProof(bundle: ProofBundle): Promise<AnchorProofOn0GResult> {
  const contractAddress = env('AGENTPROOF_REGISTRY_ADDRESS');
  const privateKey = env('AGENTPROOF_0G_PRIVATE_KEY');
  const rpcUrl = env('AGENTPROOF_0G_CHAIN_RPC');
  const explorerBaseUrl = env('AGENTPROOF_0G_EXPLORER_BASE_URL') ?? 'https://chainscan-galileo.0g.ai';

  if (contractAddress !== undefined && privateKey !== undefined && rpcUrl !== undefined) {
    return anchorProofOn0G({
      rpcUrl,
      privateKey,
      contractAddress,
      taskHash: hashJson(bundle.task_id),
      evidenceHash: bundle.proof_hash,
      resultHash: bundle.output_hash,
      storageRoot: bundle.storage_root ?? '',
      explorerBaseUrl,
    });
  }

  return createLocalAnchorProofReceipt({
    contractAddress,
    taskHash: hashJson(bundle.task_id),
    evidenceHash: bundle.proof_hash,
    resultHash: bundle.output_hash,
    storageRoot: bundle.storage_root ?? '',
    explorerBaseUrl,
  });
}

function toPassportArtifact(
  bundle: ProofBundle,
  storageUri: string | undefined,
  chain: AnchorProofOn0GResult,
): PassportArtifact {
  return {
    title: 'Agent Verification Passport',
    task: {
      id: bundle.task_id,
      description: TASK_DESCRIPTION,
      inputHash: bundle.input_hash,
    },
    agent: {
      id: bundle.agent_id ?? identity.id,
      owner: bundle.owner ?? OWNER_WALLET,
      frameworkVersion: bundle.version,
    },
    verification: {
      verdict: bundle.verifier_result === 'pass' ? 'verified' : bundle.verifier_result,
      proofHash: bundle.proof_hash,
      traceHash: bundle.trace_hash,
      outputHash: bundle.output_hash,
      policyHash: bundle.policy_hash,
    },
    storage: {
      root: bundle.storage_root ?? '',
      uri: storageUri,
    },
    chain: {
      contractAddress: chain.contractAddress,
      proofId: chain.proofId,
      transactionHash: chain.txHash,
      explorerLink: chain.explorerLink,
    },
    compute: {
      model: bundle.model ?? 'deterministic-local-agent',
      provider: bundle.compute_provider ?? 'local deterministic runtime',
      status: bundle.compute_provider?.startsWith('0G') === true ? '0G compute enabled' : 'not using 0G compute',
    },
    proofBundle: bundle,
  };
}

async function writeJson(url: URL, value: unknown): Promise<void> {
  const path = fileURLToPath(url);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeJsData(url: URL, value: unknown): Promise<void> {
  const path = fileURLToPath(url);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `window.AGENTPROOF_PASSPORT_DATA = ${JSON.stringify(value, null, 2)};\n`, 'utf8');
}

function requiredEnv(key: string): string {
  const value = env(key);
  if (value === undefined) {
    throw new Error(`${key} is required for live AgentProof demo mode.`);
  }

  return value;
}

function optionalNumberEnv(key: string): number | undefined {
  const value = env(key);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} must be a number.`);
  }

  return parsed;
}

function env(key: string): string | undefined {
  const value = process.env[key];
  return value === undefined || value === '' ? undefined : value;
}
