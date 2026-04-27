import { noirProofs } from '@0xagentio/noir';
import {
  createActionIntent,
  createAgentIdentity,
  createPolicy,
  createTrustedAgent,
  hashPolicy,
  issueLocalCredential,
  localDelegationSigner,
  localExecution,
  localMemoryStorage,
  staticReasoningEngine,
  verifyLocalDelegation,
} from '@0xagentio/sdk';

/**
 * This example shows the same SDK runtime with the real Noir proof adapter.
 *
 * Developers should care about this flow because only one line changes from a
 * local mock proof setup: `proof: noirProofs()`. The agent runtime still handles
 * reasoning, credential validation, execution, and audit storage while the Noir
 * package handles circuit execution and Barretenberg proof generation.
 */

console.log('\n0xAgentio real Noir proof example');
console.log('================================');

console.log('\n▶ Creating agent identity and policy');
const identity = createAgentIdentity({
  id: 'agent-alice-real-noir',
  publicKey: 'agent-public-key-alice-real-noir',
});

const policy = createPolicy({
  id: 'policy-real-noir',
  allowedActions: ['swap'],
  constraints: [{ type: 'max-amount', value: 500n, actionTypes: ['swap'] }],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
});
const policyHash = hashPolicy(policy);
console.log(`  - Agent: ${identity.id}`);
console.log(`  - Policy hash: ${policyHash}`);
console.log('  - Allowed action: swap up to 500 units');

console.log('\n▶ Issuing local delegated credential');
const credential = await issueLocalCredential({
  identity,
  policy,
  id: 'credential-real-noir',
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
  signer: localDelegationSigner('principal-real-noir'),
});
console.log(`  - Credential: ${credential.id}`);
console.log(`  - Delegated by: ${credential.delegation?.principalId}`);

console.log('\n▶ Defining action and runtime');
const action = createActionIntent({
  type: 'swap',
  amount: 250n,
});
const storage = localMemoryStorage();
console.log(`  - Action: ${action.type} ${action.amount?.toString()}`);
console.log('  - Proof adapter: real NoirJS + Barretenberg UltraHonk');

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
  proof: noirProofs(),
  storage,
  execution: localExecution(async ({ action, proof }) => {
    console.log('  - Execution adapter received verified runtime request');
    console.log(`  - Proof format: ${proof.format}`);
    return {
      success: true,
      reference: `real-noir-demo:${action.type}`,
      details: {
        note: 'Execution is still local; authorization proof is real Noir/Barretenberg.',
      },
    };
  }),
  now: () => new Date('2026-04-25T12:00:00.000Z'),
  createEventId: () => 'event-real-noir-proof-1',
});

console.log('\n▶ Running agent once');
console.log('  - NoirJS will execute the circuit and Barretenberg will generate the proof');
const result = await agent.startOnce();

console.log('\n▶ Final outcome');
console.log(`  - Status: ${result.status}`);
console.log(`  - Execution reference: ${result.status === 'accepted' ? (result.execution?.reference ?? 'none') : 'none'}`);
console.log(`  - Audit events: ${storage.getAuditEvents().length}`);
console.log('  - Real proving: completed locally');
