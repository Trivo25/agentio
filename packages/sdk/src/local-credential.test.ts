import assert from 'node:assert/strict';
import test from 'node:test';

import { hashPolicy } from '@0xagentio/core';

import { issueLocalCredential } from './local-credential.js';

test('issueLocalCredential binds an identity to a policy', async () => {
  const identity = { id: 'agent-test', publicKey: 'agent-public-key-test' };
  const policy = {
    id: 'policy-test',
    allowedActions: ['swap'],
    expiresAt: new Date('2026-05-01T00:00:00.000Z'),
  };

  assert.deepEqual(
    await issueLocalCredential({
      identity,
      policy,
      id: 'credential-test',
      issuedAt: new Date('2026-04-25T00:00:00.000Z'),
    }),
    {
      id: 'credential-test',
      agentId: 'agent-test',
      policyId: 'policy-test',
      policyHash: hashPolicy(policy),
      issuedAt: new Date('2026-04-25T00:00:00.000Z'),
      expiresAt: policy.expiresAt,
    },
  );
});

test('issueLocalCredential can attach a local delegation signature', async () => {
  const identity = { id: 'agent-test', publicKey: 'agent-public-key-test' };
  const policy = {
    id: 'policy-test',
    allowedActions: ['swap'],
    expiresAt: new Date('2026-05-01T00:00:00.000Z'),
  };

  const credential = await issueLocalCredential({
    identity,
    policy,
    id: 'credential-test',
    issuedAt: new Date('2026-04-25T00:00:00.000Z'),
    signer: {
      principalId: 'principal-test',
      format: 'local-test-signature',
      sign: (message) => `signed:${message}`,
    },
  });

  assert.equal(credential.delegation?.principalId, 'principal-test');
  assert.equal(credential.delegation?.format, 'local-test-signature');
  assert.match(credential.delegation?.signature ?? '', /^signed:/);
});
