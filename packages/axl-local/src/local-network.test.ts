import assert from 'node:assert/strict';
import test from 'node:test';

import { startLocalAxlNetwork } from './index.js';

test('startLocalAxlNetwork rejects duplicate node names before spawning processes', async () => {
  await assert.rejects(
    startLocalAxlNetwork({
      binaryPath: '/unused/node',
      workingDirectory: '/tmp/unused-agentio-axl',
      nodes: [
        { name: 'alice', apiPort: 9101 },
        { name: 'alice', apiPort: 9102 },
      ],
    }),
    /Duplicate local AXL node name: alice/,
  );
});

test('startLocalAxlNetwork rejects empty node names before spawning processes', async () => {
  await assert.rejects(
    startLocalAxlNetwork({
      binaryPath: '/unused/node',
      workingDirectory: '/tmp/unused-agentio-axl',
      nodes: [{ name: ' ', apiPort: 9101 }],
    }),
    /node name must not be empty/,
  );
});
