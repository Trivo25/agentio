import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isActionAllowedByPolicy,
  isPolicyExpired,
  validateActionAgainstPolicy,
} from './index.js';

const basePolicy = {
  id: 'policy-1',
  allowedActions: ['swap', 'broadcast-signal'],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
};

test('policy helpers expose the primitive expiration and action checks', () => {
  assert.equal(isPolicyExpired(basePolicy, new Date('2026-04-30T23:59:59.999Z')), false);
  assert.equal(isPolicyExpired(basePolicy, new Date('2026-05-01T00:00:00.000Z')), true);
  assert.equal(isActionAllowedByPolicy(basePolicy, { type: 'swap' }), true);
  assert.equal(isActionAllowedByPolicy(basePolicy, { type: 'transfer-ownership' }), false);
});

test('validateActionAgainstPolicy returns valid for an allowed action before expiry', () => {
  assert.deepEqual(
    validateActionAgainstPolicy(basePolicy, { type: 'swap' }, new Date('2026-04-30T00:00:00.000Z')),
    { valid: true, issues: [] },
  );
});

test('validateActionAgainstPolicy returns all policy issues for an ineligible action', () => {
  const result = validateActionAgainstPolicy(
    basePolicy,
    { type: 'transfer-ownership' },
    new Date('2026-05-01T00:00:00.000Z'),
  );

  assert.equal(result.valid, false);
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ['policy-expired', 'action-not-allowed'],
  );
});

test('validateActionAgainstPolicy applies amount constraints only to scoped allowed actions', () => {
  const policy = {
    ...basePolicy,
    constraints: [{ type: 'max-amount' as const, value: 500n, actionTypes: ['swap'] }],
  };

  assert.deepEqual(
    validateActionAgainstPolicy(policy, { type: 'broadcast-signal' }, new Date('2026-04-30T00:00:00.000Z')),
    { valid: true, issues: [] },
  );

  assert.deepEqual(
    validateActionAgainstPolicy(policy, { type: 'swap' }, new Date('2026-04-30T00:00:00.000Z')).issues.map(
      (issue) => issue.code,
    ),
    ['amount-required'],
  );
});

test('validateActionAgainstPolicy applies allowed metadata value constraints', () => {
  const policy = {
    ...basePolicy,
    constraints: [{ type: 'allowed-metadata-value' as const, key: 'assetPair', values: ['ETH/USDC'] }],
  };

  assert.deepEqual(
    validateActionAgainstPolicy(
      policy,
      { type: 'swap', metadata: { assetPair: 'ETH/USDC' } },
      new Date('2026-04-30T00:00:00.000Z'),
    ),
    { valid: true, issues: [] },
  );

  assert.deepEqual(
    validateActionAgainstPolicy(
      policy,
      { type: 'swap', metadata: { assetPair: 'WBTC/USDC' } },
      new Date('2026-04-30T00:00:00.000Z'),
    ).issues.map((issue) => issue.code),
    ['metadata-value-not-allowed'],
  );
});
