import assert from 'node:assert/strict';
import test from 'node:test';
import { hashAction, hashPolicy } from '@0xagentio/core';
import { buildAuthorizationCircuitInput, hashToField } from './witness.js';

const policy = {
  id: 'policy-witness-test',
  allowedActions: ['swap', 'request-quote'],
  constraints: [
    { type: 'max-amount' as const, value: 500n, actionTypes: ['swap'] },
    { type: 'max-amount' as const, value: 250n, actionTypes: ['request-quote'] },
    { type: 'max-cumulative-amount' as const, value: 1_000n, actionTypes: ['swap', 'request-quote'] },
  ],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
};

const credential = {
  id: 'credential-witness-test',
  agentId: 'agent-alice',
  policyId: policy.id,
  policyHash: hashPolicy(policy),
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
  expiresAt: new Date('2026-04-30T00:00:00.000Z'),
};

test('buildAuthorizationCircuitInput maps SDK proof requests into v0 circuit inputs', () => {
  const action = { type: 'swap', amount: 125n };
  const input = buildAuthorizationCircuitInput({
    credential,
    policy,
    state: { cumulativeSpend: 700n, updatedAt: new Date('2026-04-25T00:00:00.000Z') },
    action,
    now: new Date('2026-04-25T12:00:00.000Z'),
  });

  assert.deepEqual(input, {
    public_agent_id_hash: hashToField('agent-alice'),
    public_policy_hash: hashToField(credential.policyHash),
    public_action_type_hash: hashToField('swap'),
    public_action_hash: hashToField(hashAction(action)),
    public_action_amount: '125',
    action_hash: hashToField(hashAction(action)),
    credential_agent_id_hash: hashToField('agent-alice'),
    credential_policy_hash: hashToField(credential.policyHash),
    allowed_action_type_hash: hashToField('swap'),
    now: '1777118400',
    credential_expires_at: '1777507200',
    policy_expires_at: '1777593600',
    action_amount: '125',
    max_action_amount: '500',
    cumulative_amount: '700',
    max_cumulative_amount: '1000',
  });
});

test('buildAuthorizationCircuitInput uses the matching action-specific max amount', () => {
  const input = buildAuthorizationCircuitInput({
    credential,
    policy,
    state: { cumulativeSpend: 0n, updatedAt: new Date('2026-04-25T00:00:00.000Z') },
    action: { type: 'request-quote', amount: 200n },
    now: new Date('2026-04-25T12:00:00.000Z'),
  });

  assert.equal(input.max_action_amount, '250');
});

test('buildAuthorizationCircuitInput rejects policies without a circuit amount bound', () => {
  assert.throws(
    () =>
      buildAuthorizationCircuitInput({
        credential,
        policy: { id: 'policy-unbounded', allowedActions: ['swap'], expiresAt: policy.expiresAt },
        state: { cumulativeSpend: 0n, updatedAt: new Date('2026-04-25T00:00:00.000Z') },
        action: { type: 'swap', amount: 125n },
        now: new Date('2026-04-25T12:00:00.000Z'),
      }),
    /missing max-amount constraint/,
  );
});

// this guards the conservative 31-byte field hash encoding used for Noir inputs.
test('hashToField produces deterministic 248-bit decimal field values', () => {
  const field = BigInt(hashToField('agent-alice'));

  assert.equal(hashToField('agent-alice'), hashToField('agent-alice'));
  assert.notEqual(hashToField('agent-alice'), hashToField('agent-bob'));
  assert.ok(field >= 0n);
  assert.ok(field < 1n << 248n);
});


test('buildAuthorizationCircuitInput rejects policies without a circuit cumulative amount bound', () => {
  assert.throws(
    () =>
      buildAuthorizationCircuitInput({
        credential,
        policy: {
          id: 'policy-without-cumulative-bound',
          allowedActions: ['swap'],
          constraints: [{ type: 'max-amount' as const, value: 500n, actionTypes: ['swap'] }],
          expiresAt: policy.expiresAt,
        },
        state: { cumulativeSpend: 0n, updatedAt: new Date('2026-04-25T00:00:00.000Z') },
        action: { type: 'swap', amount: 125n },
        now: new Date('2026-04-25T12:00:00.000Z'),
      }),
    /missing max-cumulative-amount constraint/,
  );
});
