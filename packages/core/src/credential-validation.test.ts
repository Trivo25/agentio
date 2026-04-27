import assert from 'node:assert/strict';
import test from 'node:test';

import { hashPolicy } from './policy-commitment.js';
import { validateCredentialForPolicy } from './credential-validation.js';

const policy = {
  id: 'policy-test',
  allowedActions: ['swap'],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
};

const credential = {
  id: 'credential-test',
  agentId: 'agent-test',
  policyId: policy.id,
  policyHash: hashPolicy(policy),
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
};

test('validateCredentialForPolicy returns valid for a matching active credential', () => {
  assert.deepEqual(validateCredentialForPolicy(credential, policy, new Date('2026-04-30T00:00:00.000Z')), {
    valid: true,
    issues: [],
  });
});

test('validateCredentialForPolicy reports policy id, hash, and expiry issues', () => {
  const result = validateCredentialForPolicy(
    {
      ...credential,
      policyId: 'other-policy',
      policyHash: 'sha256:mismatch',
      expiresAt: new Date('2026-04-29T00:00:00.000Z'),
    },
    policy,
    new Date('2026-04-30T00:00:00.000Z'),
  );

  assert.equal(result.valid, false);
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ['credential-policy-id-mismatch', 'credential-policy-hash-mismatch', 'credential-expired'],
  );
});
