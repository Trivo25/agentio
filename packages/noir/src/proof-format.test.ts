import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeNoirAuthorizationProof, encodeNoirAuthorizationProof } from './proof-format.js';

test('Noir proof format preserves circuit id, proof bytes, and Noir public inputs', () => {
  const encoded = encodeNoirAuthorizationProof('agentio-authorization-v0', {
    proof: new Uint8Array([1, 2, 3]),
    publicInputs: ['0x01', '0x02', '0x03'],
  });

  const decoded = decodeNoirAuthorizationProof(encoded);

  assert.equal(decoded.circuitId, 'agentio-authorization-v0');
  assert.deepEqual([...decoded.proofData.proof], [1, 2, 3]);
  assert.deepEqual(decoded.proofData.publicInputs, ['0x01', '0x02', '0x03']);
});
