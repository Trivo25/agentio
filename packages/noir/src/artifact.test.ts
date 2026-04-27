import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadAuthorizationCircuitArtifact, parseAuthorizationCircuitArtifact } from './artifact.js';

test('parseAuthorizationCircuitArtifact keeps the proving-relevant artifact fields', () => {
  assert.deepEqual(
    parseAuthorizationCircuitArtifact({
      bytecode: 'compiled-bytecode',
      abi: { parameters: [] },
      noir_version: '1.0.0-beta.18',
      hash: 123,
      debug_symbols: 'ignored',
    }),
    {
      bytecode: 'compiled-bytecode',
      abi: { parameters: [] },
      noir_version: '1.0.0-beta.18',
      hash: 123,
    },
  );
});

test('parseAuthorizationCircuitArtifact rejects invalid compiled circuit JSON', () => {
  assert.throws(() => parseAuthorizationCircuitArtifact(null), /expected a JSON object/);
  assert.throws(() => parseAuthorizationCircuitArtifact({ abi: {} }), /missing bytecode/);
  assert.throws(() => parseAuthorizationCircuitArtifact({ bytecode: 'compiled-bytecode' }), /missing abi/);
});

test('loadAuthorizationCircuitArtifact reads a compiled circuit artifact from disk', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentio-noir-artifact-'));
  const artifactPath = join(dir, 'agentio_authorization.json');

  try {
    await writeFile(
      artifactPath,
      JSON.stringify({ bytecode: 'compiled-bytecode', abi: { parameters: [] }, noir_version: '1.0.0-beta.18' }),
    );

    const artifact = await loadAuthorizationCircuitArtifact(artifactPath);

    assert.equal(artifact.bytecode, 'compiled-bytecode');
    assert.deepEqual(artifact.abi, { parameters: [] });
    assert.equal(artifact.noir_version, '1.0.0-beta.18');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
