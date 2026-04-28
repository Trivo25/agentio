import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { prepareLocalAxlNode } from './index.js';

test('prepareLocalAxlNode writes a key and config file without starting a process', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agentio-axl-'));
  try {
    const prepared = await prepareLocalAxlNode({
      name: 'alice',
      binaryPath: '/unused/node',
      workingDirectory: directory,
      apiPort: 9101,
      listen: ['tls://127.0.0.1:9201'],
    });

    assert.equal(prepared.name, 'alice');
    assert.equal(prepared.baseUrl, 'http://127.0.0.1:9101');
    assert.equal(prepared.privateKeyPath, join(directory, 'private.pem'));
    assert.equal(prepared.configPath, join(directory, 'node-config.json'));

    const key = await readFile(prepared.privateKeyPath, 'utf8');
    assert.match(key, /BEGIN PRIVATE KEY/);

    const config = JSON.parse(await readFile(prepared.configPath, 'utf8'));
    assert.deepEqual(config, {
      PrivateKeyPath: join(directory, 'private.pem'),
      Peers: [],
      Listen: ['tls://127.0.0.1:9201'],
      api_port: 9101,
      bridge_addr: '127.0.0.1',
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
