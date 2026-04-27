import { noirProofs } from '@0xagentio/noir';
import {
  createActionIntent,
  createAgentIdentity,
  createAgentPeer,
  createAgentReply,
  createPolicy,
  createProofBackedMessage,
  hashPolicy,
  issueLocalCredential,
  localAxlTransport,
  localDelegationSigner,
  verifyMessageAction,
} from '@0xagentio/sdk';

/**
 * This example shows real proof-backed agent-to-agent authorization.
 *
 * Alice creates a request with a real Noir/Barretenberg proof. Bob is modeled as
 * an executor agent: he does not trust Alice's JSON payload by itself. He uses
 * the same Noir adapter to independently verify the proof and public inputs
 * before sending an execution receipt back to Alice.
 */

console.log('\n0xAgentio real Noir peer verification');
console.log('====================================');

console.log('\n▶ Creating Alice and Bob');
const alice = createAgentIdentity({ id: 'agent-alice-real-noir', publicKey: 'agent-public-key-alice-real-noir' });
const bob = createAgentIdentity({ id: 'agent-bob-real-noir-executor', publicKey: 'agent-public-key-bob-real-noir' });
console.log(`  - Alice: ${alice.id}`);
console.log(`  - Bob: ${bob.id}`);

console.log('\n▶ Creating delegated policy and credential');
const policy = createPolicy({
  id: 'policy-real-noir-peer',
  allowedActions: ['swap'],
  constraints: [
    { type: 'max-amount', value: 500n, actionTypes: ['swap'] },
    { type: 'max-cumulative-amount', value: 1_000n, actionTypes: ['swap'] },
  ],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
});
const policyHash = hashPolicy(policy);
const credential = await issueLocalCredential({
  identity: alice,
  policy,
  id: 'credential-real-noir-peer',
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
  signer: localDelegationSigner('principal-real-noir-peer'),
});
console.log(`  - Policy hash: ${policyHash}`);
console.log(`  - Credential: ${credential.id}`);

console.log('\n▶ Creating real Noir proof adapter and local AXL-shaped transport');
const proof = noirProofs();
const transport = localAxlTransport('agentio/real-noir-peer');
const alicePeer = createAgentPeer({ identity: alice, transport });
const bobPeer = createAgentPeer({ identity: bob, transport });
console.log('  - Proof adapter: real NoirJS + Barretenberg UltraHonk');
console.log('  - Transport: local AXL-shaped adapter');

console.log('\n▶ Bob starts listening for proof-backed execution requests');
await bobPeer.onMessage(async (message) => {
  if (message.type !== 'execute-swap-request') {
    return;
  }

  console.log(`  - Bob received request: ${message.id ?? 'untracked'}`);
  console.log('  - Bob verifies Alice proof and expected public inputs');
  const verification = await verifyMessageAction(message, proof, {
    agentId: alice.id,
    actionType: 'swap',
    policyHash,
  });

  if (!verification.valid) {
    console.log(`  - Bob rejected request: ${verification.reason}`);
    return;
  }

  console.log(`  - Bob accepted verified action: ${verification.action.type} ${verification.action.amount?.toString()}`);
  console.log('  - Bob executes local mock swap after proof verification');
  await bobPeer.send(
    alice.id,
    createAgentReply({
      id: 'real-noir-execution-reply-1',
      type: 'execute-swap-reply',
      sender: bob.id,
      createdAt: new Date('2026-04-25T12:00:01.000Z'),
      request: { ...message, id: message.id ?? 'real-noir-execution-request-1' },
      payload: {
        status: 'executed',
        receipt: `bob-real-noir-receipt:${policyHash}`,
      },
    }),
  );
});

console.log('\n▶ Alice creates a real proof-backed swap request');
const action = createActionIntent({ type: 'swap', amount: 250n });
const request = await createProofBackedMessage({
  id: 'real-noir-execution-request-1',
  type: 'execute-swap-request',
  sender: alice.id,
  createdAt: new Date('2026-04-25T12:00:00.000Z'),
  correlationId: 'real-noir-execution-session-1',
  credential,
  policy,
  state: { cumulativeSpend: 0n, updatedAt: new Date('2026-04-25T00:00:00.000Z') },
  action,
  proof,
  now: new Date('2026-04-25T12:00:00.000Z'),
  payload: {
    venue: 'bob-local-executor',
  },
});
console.log(`  - Request proof format: ${String(request.payload.proof && typeof request.payload.proof === 'object' && 'format' in request.payload.proof ? request.payload.proof.format : 'unknown')}`);

console.log('\n▶ Alice sends request and waits for Bob reply');
const replyPromise = alicePeer.request(bob.id, request, { expectedType: 'execute-swap-reply', timeoutMs: 2_000 });
await transport.receive(request);
const bobReplyEnvelope = transport.getEnvelopes().find((envelope) => envelope.message.type === 'execute-swap-reply');
if (bobReplyEnvelope === undefined) {
  throw new Error('Bob did not send an execution reply.');
}
await transport.receive(bobReplyEnvelope.message);
const reply = await replyPromise;

console.log('\n▶ Final outcome');
console.log(`  - Bob reply: ${String(reply.payload.status)}`);
console.log(`  - Receipt: ${String(reply.payload.receipt)}`);
console.log(`  - Messages sent over local AXL-shaped transport: ${transport.getEnvelopes().length}`);
console.log('  - Real proof was generated by Alice and verified independently by Bob');
