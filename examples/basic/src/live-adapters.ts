import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startLocalAxlNetwork } from '@0xagentio/axl-local';
import { createOgProgressLogger, ogKvObjectClient, ogStorage } from '@0xagentio/og';
import {
  axlTransport,
  createActionIntent,
  createAgentIdentity,
  createAgentMessage,
  createAgentRuntime,
  createPolicy,
  hashPolicy,
  issueLocalCredential,
  localDelegationSigner,
  localMemoryStorage,
  localNoirProofs,
  localVerifyingExecution,
  staticReasoningEngine,
  verifyLocalDelegation,
  type AgentMessage,
} from '@0xagentio/sdk';

/**
 * Runs one AgentIO runtime with live 0G KV storage and real local AXL nodes.
 *
 * This example is intentionally opt-in because it writes to 0G and starts real
 * Gensyn AXL node processes. It proves the SDK adapter boundary: the same
 * `createAgentRuntime` shape used in local examples can persist state on 0G and
 * send messages over AXL without changing application code.
 */

loadEnvFile();
const options = readOptions();

logTitle('0xAgentio live adapter composition');
logStep('Checking live adapter configuration');
logDetail('0G namespace', options.namespace);
logDetail('0G stream', options.streamId);
logDetail('AXL binary', options.axlBinaryPath);

const directory = await mkdtemp(join(tmpdir(), 'agentio-live-adapters-'));
const aliceApiPort = Number(process.env.AGENTIO_AXL_ALICE_API_PORT ?? 19111);
const aliceListenPort = Number(process.env.AGENTIO_AXL_ALICE_LISTEN_PORT ?? 19211);
const bobApiPort = Number(process.env.AGENTIO_AXL_BOB_API_PORT ?? 19112);

logStep('Starting real local AXL nodes');
const network = await startLocalAxlNetwork({
  binaryPath: options.axlBinaryPath,
  workingDirectory: directory,
  startupTimeoutMs: Number(process.env.AGENTIO_AXL_STARTUP_TIMEOUT_MS ?? 15_000),
  nodes: [
    {
      name: 'alice',
      apiPort: aliceApiPort,
      listen: [`tls://127.0.0.1:${aliceListenPort}`],
    },
    {
      name: 'bob',
      apiPort: bobApiPort,
      peers: [`tls://127.0.0.1:${aliceListenPort}`],
    },
  ],
});

const aliceTransport = axlTransport({
  client: network.node('alice').client,
  pollIntervalMs: 100,
  onError: (error) => console.error('Alice AXL transport error:', error),
});
const bobTransport = axlTransport({
  client: network.node('bob').client,
  pollIntervalMs: 100,
  onError: (error) => console.error('Bob AXL transport error:', error),
});

try {
  const now = new Date('2026-04-30T12:00:00.000Z');
  const aliceIdentity = createAgentIdentity({
    id: network.node('alice').peerId,
    publicKey: network.node('alice').peerId,
  });
  const bobIdentity = createAgentIdentity({
    id: network.node('bob').peerId,
    publicKey: network.node('bob').peerId,
  });
  logDetail('Alice peer', aliceIdentity.id);
  logDetail('Bob peer', bobIdentity.id);

  logStep('Creating policy, credential, proof, storage, and transport adapters');
  const policy = createPolicy({
    id: 'policy-live-adapters-swap',
    allowedActions: ['swap'],
    constraints: [
      { type: 'max-amount', value: 10n, actionTypes: ['swap'] },
      { type: 'max-cumulative-amount', value: 25n, actionTypes: ['swap'] },
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
    id: `credential-live-adapters-${Date.now()}`,
    issuedAt: now,
    signer: localDelegationSigner('principal-live-adapters-demo'),
  });
  const proof = localNoirProofs();
  const storage = ogStorage({
    namespace: options.namespace,
    client: ogKvObjectClient({
      evmRpc: options.evmRpc,
      indexerRpc: options.indexerRpc,
      kvRpc: options.kvRpc,
      privateKey: options.privateKey,
      streamId: options.streamId,
      expectedReplica: options.expectedReplica,
      finalityRequired: true,
      logSyncTimeoutMs: options.logSyncTimeoutMs,
      readRetryTimeoutMs: options.readRetryTimeoutMs,
      readRetryIntervalMs: options.readRetryIntervalMs,
      onProgress: createOgProgressLogger({ level: 1, log: console.log }),
    }),
  });
  logDetail('Policy hash', policyHash);

  const action = createActionIntent({
    type: 'swap',
    amount: 7n,
    metadata: {
      assetPair: 'ETH/USDC',
      reason: 'live adapter smoke action',
    },
  });

  const alice = createAgentRuntime({
    identity: aliceIdentity,
    credential,
    policy,
    initialState: { cumulativeSpend: 0n, updatedAt: now },
    reasoning: staticReasoningEngine(action),
    delegationVerifier: verifyLocalDelegation,
    proof,
    storage,
    transport: aliceTransport,
    execution: localVerifyingExecution(proof, async ({ action, proof }) => ({
      success: true,
      reference: `live-adapter-local-execution:${proof.publicInputs.policyHash}:${action.type}`,
      details: {
        assetPair: action.metadata?.assetPair,
        amount: action.amount,
      },
    })),
    now: () => now,
    createEventId: () => `event-live-adapters-${Date.now()}`,
  });

  const bob = createAgentRuntime({
    identity: bobIdentity,
    credential,
    policy,
    initialState: { cumulativeSpend: 0n, updatedAt: now },
    reasoning: staticReasoningEngine('skip'),
    proof,
    storage: localMemoryStorage(),
    transport: bobTransport,
  });
  const bobInbox: AgentMessage[] = [];
  bob.onMessage((message) => {
    if (message.type !== 'live-adapter.summary') {
      return;
    }

    bobInbox.push(message);
    logDetail('Bob received AXL message', `${message.type} from ${message.sender}`);
  });

  logStep('Running Alice runtime against live 0G storage');
  const result = await alice.startOnce();
  logDetail('Alice result', result.status);
  const storedState = await alice.loadState();
  logDetail('Loaded 0G state cumulative spend', String(storedState.cumulativeSpend));

  logStep('Sending Alice summary to Bob over real AXL transport');
  await alice.send(bob.identity.id, createAgentMessage({
    id: 'live-adapter-summary-1',
    type: 'live-adapter.summary',
    sender: alice.identity.id,
    createdAt: new Date('2026-04-30T12:00:01.000Z'),
    payload: {
      status: result.status,
      policyHash,
      cumulativeSpend: storedState.cumulativeSpend,
    },
  }));
  await waitUntil(() => bobInbox.length > 0, 10_000, 'Bob did not receive the AXL summary message.');

  logStep('Live adapter composition complete');
  logDetail('0G state readback', String(storedState.cumulativeSpend));
  logDetail('AXL messages received', String(bobInbox.length));
} finally {
  aliceTransport.stop();
  bobTransport.stop();
  await network.stop();
  await rm(directory, { recursive: true, force: true });
  logStep('Stopped AXL nodes');
}

type LiveAdapterOptions = {
  readonly evmRpc: string;
  readonly indexerRpc: string;
  readonly kvRpc: string;
  readonly privateKey: string;
  readonly streamId: string;
  readonly namespace: string;
  readonly axlBinaryPath: string;
  readonly expectedReplica: number;
  readonly logSyncTimeoutMs: number;
  readonly readRetryTimeoutMs: number;
  readonly readRetryIntervalMs: number;
};

function readOptions(): LiveAdapterOptions {
  const env = {
    evmRpc: process.env.AGENTIO_0G_EVM_RPC,
    indexerRpc: process.env.AGENTIO_0G_INDEXER_RPC,
    kvRpc: process.env.AGENTIO_0G_KV_RPC,
    privateKey: process.env.AGENTIO_0G_PRIVATE_KEY,
    streamId: process.env.AGENTIO_0G_STREAM_ID,
    axlBinaryPath: process.env.AGENTIO_AXL_NODE_BINARY,
  };
  const missing = Object.entries(env)
    .filter(([, value]) => value === undefined || value === '')
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment values: ${missing.join(', ')}.`);
  }

  const { evmRpc, indexerRpc, kvRpc, privateKey, streamId, axlBinaryPath } = env;
  if (evmRpc === undefined || indexerRpc === undefined || kvRpc === undefined || axlBinaryPath === undefined) {
    throw new Error('Live adapter configuration is incomplete.');
  }
  if (!isPrivateKey(privateKey)) {
    throw new Error('AGENTIO_0G_PRIVATE_KEY must be a 0x-prefixed 32-byte private key.');
  }
  if (!isBytes32(streamId)) {
    throw new Error('AGENTIO_0G_STREAM_ID must be a 0x-prefixed 32-byte stream id.');
  }

  return {
    evmRpc,
    indexerRpc,
    kvRpc,
    privateKey,
    streamId,
    axlBinaryPath,
    namespace: process.env.AGENTIO_0G_NAMESPACE ?? `agentio-live-adapters-${Date.now()}`,
    expectedReplica: readPositiveInteger(process.env.AGENTIO_0G_EXPECTED_REPLICA, 2),
    logSyncTimeoutMs: readPositiveInteger(process.env.AGENTIO_0G_LOG_SYNC_TIMEOUT_MS, 30_000),
    readRetryTimeoutMs: readPositiveInteger(process.env.AGENTIO_0G_KV_READ_RETRY_TIMEOUT_MS, 120_000),
    readRetryIntervalMs: readPositiveInteger(process.env.AGENTIO_0G_KV_READ_RETRY_INTERVAL_MS, 500),
  };
}

function isPrivateKey(value: string | undefined): value is string {
  return /^0x[0-9a-fA-F]{64}$/.test(value ?? '');
}

function isBytes32(value: string | undefined): value is string {
  return /^0x[0-9a-fA-F]{64}$/.test(value ?? '');
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function waitUntil(condition: () => boolean, timeoutMs: number, timeoutMessage: string): Promise<void> {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(timeoutMessage);
    }
    await delay(100);
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
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

function parseEnvLine(line: string): { readonly key: string; readonly value: string } | undefined {
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
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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
