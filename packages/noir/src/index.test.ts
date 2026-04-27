import assert from 'node:assert/strict';
import test from 'node:test';
import type { CredentialProof } from '@0xagentio/core';
import { NOIR_AUTHORIZATION_PROOF_FORMAT, noirProofs } from './index.js';

test('noirProofs rejects unsupported proof formats before loading Noir artifacts', async () => {
  const adapter = noirProofs({ circuitId: 'agentio-authorization-v0' });

  const result = await adapter.verifyProof({
    format: 'unsupported-proof-format',
    proof: new Uint8Array([1]),
    publicInputs: {},
  } satisfies CredentialProof);

  assert.deepEqual(result, { valid: false, reason: 'Unsupported proof format unsupported-proof-format.' });
});

test('noirProofs rejects malformed Noir proof payloads before backend verification', async () => {
  const adapter = noirProofs({ circuitId: 'agentio-authorization-v0' });

  const result = await adapter.verifyProof({
    format: NOIR_AUTHORIZATION_PROOF_FORMAT,
    proof: new TextEncoder().encode('{}'),
    publicInputs: {},
  } satisfies CredentialProof);

  assert.equal(result.valid, false);
  assert.match(result.reason ?? '', /missing circuitId/);
});
