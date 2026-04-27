import assert from 'node:assert/strict';
import type { ProofAdapter, ProofRequest } from '@0xagentio/core';
import { createAuthorizationFixtureRequest } from './fixture.js';
import { NOIR_AUTHORIZATION_PROOF_FORMAT } from './proof-format.js';
import { noirProofs } from './adapter.js';

/**
 * Runs the shared proof-adapter expectations against the real Noir adapter.
 *
 * This smoke is intentionally separate from default unit tests because it runs
 * Barretenberg proof generation. It gives backend integrators confidence that
 * the real adapter behaves like the lightweight local adapter at the SDK seam:
 * authorized actions prove, unauthorized actions reject, and unsupported proof
 * formats do not verify.
 */
export async function runNoirProofAdapterSmoke(proofAdapter: ProofAdapter = noirProofs()): Promise<void> {
  const request = createAuthorizationFixtureRequest();

  await assertAuthorizedActionProof(proofAdapter, request);
  await assertUnauthorizedActionRejected(proofAdapter, request);
  await assertUnsupportedProofRejected(proofAdapter, request);

  console.log('Noir proof adapter smoke passed: prove, reject, and unsupported-format checks succeeded.');
}

async function assertAuthorizedActionProof(proofAdapter: ProofAdapter, request: ProofRequest): Promise<void> {
  const result = await proofAdapter.proveAction(request);

  assert.equal(result.proof.format, NOIR_AUTHORIZATION_PROOF_FORMAT);
  assert.ok(result.proof.proof.length > 0);
  assert.deepEqual(result.proof.publicInputs, {
    agentId: request.credential.agentId,
    policyHash: request.credential.policyHash,
    actionType: request.action.type,
  });

  assert.deepEqual(await proofAdapter.verifyProof(result.proof), { valid: true, reason: undefined });
}

async function assertUnauthorizedActionRejected(proofAdapter: ProofAdapter, request: ProofRequest): Promise<void> {
  await assert.rejects(
    proofAdapter.proveAction({
      ...request,
      action: {
        ...request.action,
        amount: 501n,
      },
    }),
    /amount-exceeds-maximum/,
  );
}

async function assertUnsupportedProofRejected(proofAdapter: ProofAdapter, request: ProofRequest): Promise<void> {
  assert.deepEqual(
    await proofAdapter.verifyProof({
      format: 'unsupported-proof-format',
      proof: new Uint8Array([1]),
      publicInputs: {
        agentId: request.credential.agentId,
        policyHash: request.credential.policyHash,
        actionType: request.action.type,
      },
    }),
    { valid: false, reason: 'Unsupported proof format unsupported-proof-format.' },
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runNoirProofAdapterSmoke();
}
