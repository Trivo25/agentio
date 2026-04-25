import assert from 'node:assert/strict';
import test from 'node:test';

import { isActionAllowedByPolicy, isPolicyExpired } from './index.js';

const basePolicy = {
  id: 'policy-1',
  allowedActions: ['swap', 'broadcast-signal'],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
};

test('isPolicyExpired returns false before policy expiry', () => {
  assert.equal(isPolicyExpired(basePolicy, new Date('2026-04-30T23:59:59.999Z')), false);
});

test('isPolicyExpired returns true at policy expiry', () => {
  assert.equal(isPolicyExpired(basePolicy, new Date('2026-05-01T00:00:00.000Z')), true);
});

test('isActionAllowedByPolicy returns true for allowed action type', () => {
  assert.equal(isActionAllowedByPolicy(basePolicy, { type: 'swap' }), true);
});

test('isActionAllowedByPolicy returns false for unknown action type', () => {
  assert.equal(isActionAllowedByPolicy(basePolicy, { type: 'transfer-ownership' }), false);
});
