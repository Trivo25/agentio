import {
  createActionIntent,
  createAgentIdentity,
  createPolicy,
  createTrustedAgent,
  issueLocalCredential,
  localDelegationSigner,
  localExecution,
  localMemoryStorage,
  localPolicyProofs,
  staticReasoningEngine,
  verifyLocalDelegation,
} from '@0xagentio/sdk';

import { toJsonSafe } from './json.js';

// This example shows how delegation verification changes runtime behavior.
// The unsigned credential is rejected before reasoning can lead to execution,
// while the locally signed credential can continue through proof and execution.

const identity = createAgentIdentity({
  id: 'agent-alice',
  publicKey: 'agent-public-key-alice',
});

const policy = createPolicy({
  id: 'policy-delegation-gate',
  allowedActions: ['broadcast-signal'],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
});

const action = createActionIntent({
  type: 'broadcast-signal',
  metadata: { channel: 'demo' },
});

const initialState = {
  cumulativeSpend: 0n,
  updatedAt: new Date('2026-04-25T00:00:00.000Z'),
};

const unsignedCredential = await issueLocalCredential({
  identity,
  policy,
  id: 'credential-unsigned',
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
});

const signedCredential = await issueLocalCredential({
  identity,
  policy,
  id: 'credential-signed',
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
  signer: localDelegationSigner('principal-alice'),
});

const proof = localPolicyProofs();
const storage = localMemoryStorage();
const executionReferences: string[] = [];
const execution = localExecution(async ({ action, proof }) => {
  const credentialId = String(proof.publicInputs.credentialId);
  const reference = `local-execution:${credentialId}:${action.type}`;
  executionReferences.push(reference);

  return {
    success: true,
    reference,
  };
});

const unsignedAgent = createTrustedAgent({
  identity,
  credential: unsignedCredential,
  policy,
  initialState,
  reasoning: staticReasoningEngine(action),
  delegationVerifier: verifyLocalDelegation,
  proof,
  storage,
  execution,
  now: () => new Date('2026-04-25T12:00:00.000Z'),
  createEventId: () => 'event-unsigned-delegation',
});

const signedAgent = createTrustedAgent({
  identity,
  credential: signedCredential,
  policy,
  initialState,
  reasoning: staticReasoningEngine(action),
  delegationVerifier: verifyLocalDelegation,
  proof,
  storage,
  execution,
  now: () => new Date('2026-04-25T12:01:00.000Z'),
  createEventId: () => 'event-signed-delegation',
});

const unsignedResult = await unsignedAgent.startOnce();
const signedResult = await signedAgent.startOnce();

console.log(
  JSON.stringify(
    toJsonSafe({
      unsignedResult,
      signedResult,
      executionReferences,
      auditEvents: storage.getAuditEvents(),
    }),
    null,
    2,
  ),
);
