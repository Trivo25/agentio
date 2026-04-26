import assert from 'node:assert/strict';
import test from 'node:test';

import { createNoirAuthorizationInput } from './noir.js';

const request = {
  credential: {
    id: 'credential-test',
    agentId: 'agent-test',
    policyId: 'policy-test',
    policyHash: 'sha256:test',
    issuedAt: new Date('2026-04-25T00:00:00.000Z'),
    expiresAt: new Date('2026-05-01T00:00:00.000Z'),
  },
  policy: {
    id: 'policy-test',
    allowedActions: ['swap'],
    expiresAt: new Date('2026-05-01T00:00:00.000Z'),
  },
  state: {
    cumulativeSpend: 100n,
    updatedAt: new Date('2026-04-25T00:00:00.000Z'),
  },
  action: {
    type: 'swap',
    amount: 250n,
    metadata: { assetPair: 'ETH/USDC', urgent: false },
  },
  now: new Date('2026-04-25T12:00:00.000Z'),
};

test('createNoirAuthorizationInput maps proof requests into public and private authorization inputs', () => {
  assert.deepEqual(createNoirAuthorizationInput(request), {
    publicInputs: {
      agentId: 'agent-test',
      policyHash: 'sha256:test',
      actionType: 'swap',
    },
    privateInputs: {
      credentialId: 'credential-test',
      policyId: 'policy-test',
      credentialExpiresAt: 1777593600,
      policyExpiresAt: 1777593600,
      now: 1777118400,
      actionAmount: 250n,
      cumulativeSpend: 100n,
      metadata: { assetPair: 'ETH/USDC', urgent: false },
    },
  });
});

test('createNoirAuthorizationInput rejects nested metadata until a circuit-specific encoder exists', () => {
  assert.throws(
    () =>
      createNoirAuthorizationInput({
        ...request,
        action: {
          type: 'swap',
          metadata: { nested: { assetPair: 'ETH/USDC' } },
        },
      }),
    /Cannot convert metadata key nested to Noir authorization input/,
  );
});
