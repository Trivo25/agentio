import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentIdentity } from './identity.js';

test('createAgentIdentity returns a core identity shape', () => {
  assert.deepEqual(
    createAgentIdentity({
      id: 'agent-test',
      publicKey: 'agent-public-key-test',
    }),
    {
      id: 'agent-test',
      publicKey: 'agent-public-key-test',
    },
  );
});
