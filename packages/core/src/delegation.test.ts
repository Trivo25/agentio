import assert from 'node:assert/strict';
import test from 'node:test';

import { credentialDelegationStatement, serializeDelegationStatement } from './delegation.js';

test('serializeDelegationStatement returns deterministic signer input', () => {
  assert.equal(
    serializeDelegationStatement({
      principalId: 'principal-test',
      agentId: 'agent-test',
      policyId: 'policy-test',
      policyHash: 'sha256:test',
      expiresAt: new Date('2026-05-01T00:00:00.000Z'),
    }),
    '{"agentId":"agent-test","expiresAt":"2026-05-01T00:00:00.000Z","policyHash":"sha256:test","policyId":"policy-test","principalId":"principal-test"}',
  );
});

test('credentialDelegationStatement derives signer input fields from a credential', () => {
  assert.deepEqual(
    credentialDelegationStatement(
      {
        id: 'credential-test',
        agentId: 'agent-test',
        policyId: 'policy-test',
        policyHash: 'sha256:test',
        issuedAt: new Date('2026-04-25T00:00:00.000Z'),
        expiresAt: new Date('2026-05-01T00:00:00.000Z'),
      },
      'principal-test',
    ),
    {
      principalId: 'principal-test',
      agentId: 'agent-test',
      policyId: 'policy-test',
      policyHash: 'sha256:test',
      expiresAt: new Date('2026-05-01T00:00:00.000Z'),
    },
  );
});
