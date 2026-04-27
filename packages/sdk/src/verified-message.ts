import type { AgentMessage, CredentialProof, ProofAdapter, TransportAdapter, VerifierResult } from '@0xagentio/core';

/**
 * Result returned after verifying a credential-carrying message.
 */
export type VerifiedMessageResult =
  | {
      readonly valid: true;
      readonly message: AgentMessage;
      readonly proof: CredentialProof;
      readonly verification: VerifierResult;
    }
  | {
      readonly valid: false;
      readonly message: AgentMessage;
      readonly reason: string;
      readonly verification?: VerifierResult;
    };

/**
 * Expected public inputs for an action proof carried by a message.
 */
export type VerifyMessageActionExpectations = {
  /** Expected delegated agent id in proof public inputs. */
  readonly agentId?: string;
  /** Expected action type in proof public inputs. */
  readonly actionType?: string;
  /** Expected policy commitment in proof public inputs. */
  readonly policyHash?: string;
};

/**
 * Result returned after verifying a message proof and expected action public inputs.
 */
export type VerifiedMessageActionResult =
  | (Extract<VerifiedMessageResult, { valid: true }> & {
      readonly expected: VerifyMessageActionExpectations;
    })
  | (Extract<VerifiedMessageResult, { valid: false }> & {
      readonly expected: VerifyMessageActionExpectations;
    });

/**
 * Handlers invoked after a transport message is verified or rejected.
 */
export type VerifiedMessageHandlers = {
  /** Called when a message carries a valid credential proof. */
  readonly onTrusted: (result: Extract<VerifiedMessageResult, { valid: true }>) => Promise<void> | void;
  /** Called when a message is missing a proof or fails verification. */
  readonly onRejected?: (result: Extract<VerifiedMessageResult, { valid: false }>) => Promise<void> | void;
};

/**
 * Verifies the credential proof carried in an agent message payload.
 */
export async function verifyCredentialMessage(
  message: AgentMessage,
  proofAdapter: ProofAdapter,
): Promise<VerifiedMessageResult> {
  const proof = message.payload.proof;
  if (!isCredentialProofLike(proof)) {
    return { valid: false, message, reason: 'missing-proof' };
  }

  const verification = await proofAdapter.verifyProof(proof);
  if (!verification.valid) {
    return { valid: false, message, reason: verification.reason ?? 'proof-verification-failed', verification };
  }

  return { valid: true, message, proof, verification };
}

/**
 * Verifies a message proof and checks expected action public inputs.
 */
export async function verifyMessageAction(
  message: AgentMessage,
  proofAdapter: ProofAdapter,
  expected: VerifyMessageActionExpectations,
): Promise<VerifiedMessageActionResult> {
  const result = await verifyCredentialMessage(message, proofAdapter);
  if (!result.valid) {
    return { ...result, expected };
  }

  const mismatch = findPublicInputMismatch(result.proof.publicInputs, expected);
  if (mismatch !== undefined) {
    return {
      valid: false,
      message,
      reason: `public-input-mismatch:${mismatch}`,
      verification: result.verification,
      expected,
    };
  }

  return { ...result, expected };
}

/**
 * Registers a verified-message handler on a transport adapter.
 */
export function onVerifiedMessage(
  transport: TransportAdapter,
  proofAdapter: ProofAdapter,
  handlers: VerifiedMessageHandlers,
): Promise<void> | void {
  return transport.onMessage(async (message) => {
    const result = await verifyCredentialMessage(message, proofAdapter);
    if (result.valid) {
      await handlers.onTrusted(result);
      return;
    }

    await handlers.onRejected?.(result);
  });
}

function findPublicInputMismatch(
  publicInputs: Readonly<Record<string, unknown>>,
  expected: VerifyMessageActionExpectations,
): string | undefined {
  if (expected.agentId !== undefined && publicInputs.agentId !== expected.agentId) {
    return 'agentId';
  }

  if (expected.actionType !== undefined && publicInputs.actionType !== expected.actionType) {
    return 'actionType';
  }

  if (expected.policyHash !== undefined && publicInputs.policyHash !== expected.policyHash) {
    return 'policyHash';
  }

  return undefined;
}

function isCredentialProofLike(value: unknown): value is CredentialProof {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { format?: unknown; proof?: unknown; publicInputs?: unknown };
  return typeof candidate.format === 'string' && candidate.proof instanceof Uint8Array && isRecord(candidate.publicInputs);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
