import assert from 'node:assert/strict';
import test from 'node:test';
import type { CredentialProof, ProofRequest } from '@0xagentio/core';
import { noirProofs } from './index.js';

test('noirProofs exposes the future ProofAdapter boundary without accepting proofs yet', async () => {
  const adapter = noirProofs({ circuitId: 'agentio-authorization-v0' });

  await assert.rejects(
    adapter.proveAction({} as ProofRequest),
    /real Noir proof adapter is not implemented yet/,
  );

  const result = await adapter.verifyProof({
    format: 'noir-ultrahonk-authorization',
    proof: new Uint8Array([1]),
    publicInputs: {},
  } satisfies CredentialProof);

  assert.equal(result.valid, false);
  assert.match(result.reason ?? '', /real Noir proof adapter is not implemented yet/);
});
