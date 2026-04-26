import assert from 'node:assert/strict';
import test from 'node:test';

import { hashPolicy, serializePolicy } from './policy-commitment.js';

const policy = {
  id: 'policy-test',
  allowedActions: ['swap'],
  constraints: [
    { type: 'max-amount' as const, value: 500n, actionTypes: ['swap'] },
    { type: 'allowed-metadata-value' as const, key: 'assetPair', values: ['ETH/USDC'], actionTypes: ['swap'] },
  ],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
};

test('serializePolicy returns deterministic JSON with typed dates and bigints', () => {
  assert.equal(
    serializePolicy(policy),
    '{"allowedActions":["swap"],"constraints":[{"actionTypes":["swap"],"type":"max-amount","value":{"type":"bigint","value":"500"}},{"actionTypes":["swap"],"key":"assetPair","type":"allowed-metadata-value","values":["ETH/USDC"]}],"expiresAt":{"type":"date","value":"2026-05-01T00:00:00.000Z"},"id":"policy-test"}',
  );
});

test('serializePolicy is stable regardless of object key insertion order', () => {
  const samePolicyDifferentOrder = {
    expiresAt: new Date('2026-05-01T00:00:00.000Z'),
    constraints: [
      { actionTypes: ['swap'], value: 500n, type: 'max-amount' as const },
      { values: ['ETH/USDC'], type: 'allowed-metadata-value' as const, actionTypes: ['swap'], key: 'assetPair' },
    ],
    allowedActions: ['swap'],
    id: 'policy-test',
  };

  assert.equal(serializePolicy(samePolicyDifferentOrder), serializePolicy(policy));
});

test('hashPolicy returns a stable sha256 policy commitment', () => {
  assert.match(hashPolicy(policy), /^sha256:[a-f0-9]{64}$/);
  assert.equal(hashPolicy(policy), hashPolicy(policy));
});
