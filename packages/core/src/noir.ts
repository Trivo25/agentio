import type { ProofRequest } from './proof.js';

/**
 * Metadata values that can be carried into a Noir adapter boundary without object encoding.
 */
export type NoirMetadataValue = string | number | boolean | bigint;

/**
 * Public authorization inputs expected to remain inspectable after proof generation.
 */
export type NoirAuthorizationPublicInputs = {
  /** Agent receiving delegated authority. */
  readonly agentId: string;
  /** Deterministic commitment to the policy contents. */
  readonly policyHash: string;
  /** Action kind being authorized. */
  readonly actionType: string;
};

/**
 * Private authorization inputs used by a future Noir circuit witness builder.
 */
export type NoirAuthorizationPrivateInputs = {
  /** Credential identifier used by the proving adapter. */
  readonly credentialId: string;
  /** Policy identifier linked to the credential. */
  readonly policyId: string;
  /** Credential expiry as Unix seconds. */
  readonly credentialExpiresAt: number;
  /** Policy expiry as Unix seconds. */
  readonly policyExpiresAt: number;
  /** Proof time as Unix seconds. */
  readonly now: number;
  /** Optional action amount in caller-defined smallest units. */
  readonly actionAmount?: bigint;
  /** Current cumulative spend from agent state. */
  readonly cumulativeSpend: bigint;
  /** Primitive metadata values that a circuit-specific adapter may encode into fields. */
  readonly metadata?: Readonly<Record<string, NoirMetadataValue>>;
};

/**
 * Pre-field authorization input for a future Noir proof adapter.
 */
export type NoirAuthorizationInput = {
  /** Values that should become verifier-visible public inputs. */
  readonly publicInputs: NoirAuthorizationPublicInputs;
  /** Values that should become private witness inputs. */
  readonly privateInputs: NoirAuthorizationPrivateInputs;
};

/**
 * Converts a generic proof request into the SDK's Noir adapter input shape.
 */
export function createNoirAuthorizationInput(request: ProofRequest): NoirAuthorizationInput {
  return {
    publicInputs: {
      agentId: request.credential.agentId,
      policyHash: request.credential.policyHash,
      actionType: request.action.type,
    },
    privateInputs: {
      credentialId: request.credential.id,
      policyId: request.policy.id,
      credentialExpiresAt: toUnixSeconds(request.credential.expiresAt),
      policyExpiresAt: toUnixSeconds(request.policy.expiresAt),
      now: toUnixSeconds(request.now),
      actionAmount: request.action.amount,
      cumulativeSpend: request.state.cumulativeSpend,
      metadata: normalizeNoirMetadata(request.action.metadata),
    },
  };
}

function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function normalizeNoirMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, NoirMetadataValue>> | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (isNoirMetadataValue(value)) {
        return [key, value];
      }

      throw new TypeError(`Cannot convert metadata key ${key} to Noir authorization input.`);
    }),
  );
}

function isNoirMetadataValue(value: unknown): value is NoirMetadataValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint';
}
