import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { writeAuthorizationProverFixture } from './fixture.js';

test('writeAuthorizationProverFixture serializes witness builder output as Prover.toml', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agentio-noir-fixture-'));
  const outputPath = join(dir, 'Prover.toml');

  try {
    await writeAuthorizationProverFixture(outputPath);
    const toml = await readFile(outputPath, 'utf8');

    assert.match(toml, /^public_agent_id_hash = "\d+"/m);
    assert.match(toml, /^public_policy_hash = "\d+"/m);
    assert.match(toml, /^public_action_type_hash = "\d+"/m);
    assert.match(toml, /^now = "1777118400"/m);
    assert.match(toml, /^action_amount = "250"/m);
    assert.match(toml, /^max_action_amount = "500"/m);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
