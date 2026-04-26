import assert from 'node:assert/strict';
import test from 'node:test';

import { createPolicy } from './policy.js';

test('createPolicy returns a core policy shape', () => {
  const policy = createPolicy({
    id: 'policy-test',
    allowedActions: ['swap'],
    constraints: [{ type: 'max-amount', value: 500n, actionTypes: ['swap'] }],
    expiresAt: new Date('2026-05-01T00:00:00.000Z'),
  });

  assert.equal(policy.id, 'policy-test');
  assert.deepEqual(policy.allowedActions, ['swap']);
  assert.equal(policy.constraints?.[0]?.type, 'max-amount');
});
