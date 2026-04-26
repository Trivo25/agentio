import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentIdentity } from './identity.js';
import { issueLocalCredential } from './local-credential.js';
import { localDelegationSigner, verifyLocalDelegation } from './local-delegation.js';
import { createPolicy } from './policy.js';

const identity = createAgentIdentity({ id: 'agent-test', publicKey: 'agent-public-key-test' });
const policy = createPolicy({
  id: 'policy-test',
  allowedActions: ['swap'],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
});

test('verifyLocalDelegation accepts credentials signed by localDelegationSigner', async () => {
  const credential = await issueLocalCredential({
    identity,
    policy,
    id: 'credential-test',
    issuedAt: new Date('2026-04-25T00:00:00.000Z'),
    signer: localDelegationSigner('principal-test'),
  });

  assert.deepEqual(verifyLocalDelegation(credential), { valid: true });
});

test('verifyLocalDelegation rejects missing, unsupported, and mismatched signatures', async () => {
  const credential = await issueLocalCredential({
    identity,
    policy,
    id: 'credential-test',
    issuedAt: new Date('2026-04-25T00:00:00.000Z'),
  });

  assert.deepEqual(verifyLocalDelegation(credential), { valid: false, reason: 'missing-delegation' });
  assert.deepEqual(
    verifyLocalDelegation({
      ...credential,
      delegation: { principalId: 'principal-test', format: 'other-format', signature: 'signed' },
    }),
    { valid: false, reason: 'unsupported-format' },
  );
  assert.deepEqual(
    verifyLocalDelegation({
      ...credential,
      delegation: {
        principalId: 'principal-test',
        format: 'local-delegation-signature',
        signature: 'tampered',
      },
    }),
    { valid: false, reason: 'signature-mismatch' },
  );
});
