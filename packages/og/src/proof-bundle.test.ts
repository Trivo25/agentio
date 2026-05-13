import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLocalAnchorProofReceipt,
  createProofBundle,
  hashForBytes32,
  localProofBundleObjectClient,
  uploadProofBundleTo0G,
} from './index.js';

test('creates deterministic proof bundle hashes', () => {
  const first = createProofBundle({
    taskId: 'task-1',
    input: { b: 2, a: 1 },
    output: { ok: true },
    proof: { format: 'local', proof: new Uint8Array([1, 2, 3]) },
    verifierResult: 'pass',
    createdAt: '2026-05-12T00:00:00.000Z',
  });

  const second = createProofBundle({
    taskId: 'task-1',
    input: { a: 1, b: 2 },
    output: { ok: true },
    proof: { proof: new Uint8Array([1, 2, 3]), format: 'local' },
    verifierResult: 'pass',
    createdAt: '2026-05-12T00:00:00.000Z',
  });

  assert.equal(first.input_hash, second.input_hash);
  assert.equal(first.proof_hash, second.proof_hash);
  assert.match(hashForBytes32(first.proof_hash), /^0x[0-9a-f]{64}$/);
});

test('uploads proof bundle through the 0G object-client contract', async () => {
  const client = localProofBundleObjectClient();
  const bundle = createProofBundle({
    taskId: 'task-2',
    input: 'review contract',
    output: 'verified',
    proof: 'proof',
    verifierResult: 'pass',
    createdAt: '2026-05-12T00:00:00.000Z',
  });

  const uploaded = await uploadProofBundleTo0G(bundle, { client });

  assert.match(uploaded.storageRoot, /^sha256:[0-9a-f]{64}$/);
  assert.equal(uploaded.bundle.storage_root, uploaded.storageRoot);
});

test('creates local preview chain receipt without network writes', () => {
  const receipt = createLocalAnchorProofReceipt({
    taskHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    evidenceHash: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
    resultHash: 'sha256:3333333333333333333333333333333333333333333333333333333333333333',
    storageRoot: 'sha256:4444444444444444444444444444444444444444444444444444444444444444',
    explorerBaseUrl: 'https://chainscan-galileo.0g.ai',
  });

  assert.match(receipt.txHash, /^0x[0-9a-f]{64}$/);
  assert.equal(receipt.explorerLink, `https://chainscan-galileo.0g.ai/tx/${receipt.txHash}`);
});
