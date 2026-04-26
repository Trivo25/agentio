import assert from 'node:assert/strict';
import test from 'node:test';

import { issueLocalCredential } from './local-credential.js';

test('issueLocalCredential binds an identity to a policy', () => {
  const identity = { id: 'agent-test', publicKey: 'agent-public-key-test' };
  const policy = {
    id: 'policy-test',
    allowedActions: ['swap'],
    expiresAt: new Date('2026-05-01T00:00:00.000Z'),
  };

  assert.deepEqual(
    issueLocalCredential({
      identity,
      policy,
      id: 'credential-test',
      issuedAt: new Date('2026-04-25T00:00:00.000Z'),
    }),
    {
      id: 'credential-test',
      agentId: 'agent-test',
      policyId: 'policy-test',
      issuedAt: new Date('2026-04-25T00:00:00.000Z'),
      expiresAt: policy.expiresAt,
    },
  );
});
