import { createHash } from 'node:crypto';
import type { PolicyConstraint, ProofRequest } from '@0xagentio/core';
import { createNoirAuthorizationInput } from '@0xagentio/core';

/**
 * Field inputs consumed by the v0 authorization circuit.
 *
 * These values are the bridge between SDK concepts and Noir witnesses. Public
 * fields stay visible to Bob-like verifier agents, while the credential and
 * policy fields are private witness values used to prove the public claim.
 */
export type AuthorizationCircuitInput = {
  readonly public_agent_id_hash: string;
  readonly public_policy_hash: string;
  readonly public_action_type_hash: string;
  readonly public_action_hash: string;
  readonly public_action_amount: string;
  readonly action_hash: string;
  readonly credential_agent_id_hash: string;
  readonly credential_policy_hash: string;
  readonly allowed_action_type_hash: string;
  readonly now: string;
  readonly credential_expires_at: string;
  readonly policy_expires_at: string;
  readonly action_amount: string;
  readonly max_action_amount: string;
  readonly cumulative_amount: string;
  readonly max_cumulative_amount: string;
};

/**
 * Builds the Noir authorization circuit input for one SDK proof request.
 *
 * Developers should care about this function because it is the exact place
 * where agent ids, policy commitments, action types, expiry windows, and amount
 * constraints become circuit fields. Keeping this mapping deterministic lets the
 * local adapter, real Noir adapter, and executor-side verification agree on the
 * same authorization statement.
 */
export function buildAuthorizationCircuitInput(request: ProofRequest): AuthorizationCircuitInput {
  const authorizationInput = createNoirAuthorizationInput(request);
  const maxActionAmount = findPolicyAmountBound(request, 'max-amount');
  const maxCumulativeAmount = findPolicyAmountBound(request, 'max-cumulative-amount');

  return {
    public_agent_id_hash: hashToField(authorizationInput.publicInputs.agentId),
    public_policy_hash: hashToField(authorizationInput.publicInputs.policyHash),
    public_action_type_hash: hashToField(authorizationInput.publicInputs.actionType),
    public_action_hash: hashToField(authorizationInput.publicInputs.actionHash),
    public_action_amount: toCircuitU64(BigInt(authorizationInput.publicInputs.actionAmount), 'publicActionAmount'),
    action_hash: hashToField(authorizationInput.publicInputs.actionHash),
    credential_agent_id_hash: hashToField(request.credential.agentId),
    credential_policy_hash: hashToField(request.credential.policyHash),
    allowed_action_type_hash: hashToField(request.action.type),
    now: toCircuitU64(authorizationInput.privateInputs.now, 'now'),
    credential_expires_at: toCircuitU64(authorizationInput.privateInputs.credentialExpiresAt, 'credentialExpiresAt'),
    policy_expires_at: toCircuitU64(authorizationInput.privateInputs.policyExpiresAt, 'policyExpiresAt'),
    action_amount: toCircuitU64(authorizationInput.privateInputs.actionAmount ?? 0n, 'actionAmount'),
    max_action_amount: toCircuitU64(maxActionAmount, 'maxActionAmount'),
    cumulative_amount: toCircuitU64(authorizationInput.privateInputs.cumulativeSpend, 'cumulativeSpend'),
    max_cumulative_amount: toCircuitU64(maxCumulativeAmount, 'maxCumulativeAmount'),
  };
}

/**
 * Hashes arbitrary SDK strings into a conservative Noir Field decimal string.
 *
 * Noir field values must fit inside the backend field modulus. Using the first
 * 31 SHA-256 bytes gives us a deterministic 248-bit value, which is small
 * enough for BN254-style fields while still avoiding raw string exposure inside
 * the circuit input.
 */
export function hashToField(value: string): string {
  const digest = createHash('sha256').update(value).digest();
  const fieldBytes = digest.subarray(0, 31);
  return BigInt(`0x${fieldBytes.toString('hex')}`).toString();
}

function findPolicyAmountBound(request: ProofRequest, type: 'max-amount' | 'max-cumulative-amount'): bigint {
  const matchingConstraints = (request.policy.constraints ?? [])
    .filter((constraint): constraint is Extract<PolicyConstraint, { type: typeof type }> => constraint.type === type)
    .filter((constraint) => constraint.actionTypes === undefined || constraint.actionTypes.includes(request.action.type));

  if (matchingConstraints.length === 0) {
    throw new Error(`Cannot build authorization circuit input for action ${request.action.type}: missing ${type} constraint.`);
  }

  return matchingConstraints.reduce((smallest, constraint) =>
    constraint.value < smallest ? constraint.value : smallest,
  matchingConstraints[0]!.value);
}

function toCircuitU64(value: number | bigint, label: string): string {
  const bigintValue = typeof value === 'bigint' ? value : BigInt(value);
  const maxU64 = (1n << 64n) - 1n;

  if (bigintValue < 0n || bigintValue > maxU64) {
    throw new RangeError(`Cannot encode ${label} as Noir u64.`);
  }

  return bigintValue.toString();
}
