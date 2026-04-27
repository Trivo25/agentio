import type { ProofData } from '@aztec/bb.js';

/** Proof format emitted by the first real Noir authorization adapter. */
export const NOIR_AUTHORIZATION_PROOF_FORMAT = 'noir-ultrahonk-authorization-v0';

/** Payload stored inside the generic SDK `CredentialProof.proof` bytes. */
export type EncodedNoirAuthorizationProof = {
  readonly circuitId: string;
  readonly proof: string;
  readonly noirPublicInputs: readonly string[];
};

/**
 * Encodes Barretenberg proof data into the SDK's generic proof byte slot.
 *
 * The core SDK intentionally knows only about opaque proof bytes. This helper
 * lets the Noir package preserve Barretenberg's proof bytes plus its Noir
 * public inputs without leaking backend-specific fields into `@0xagentio/core`.
 */
export function encodeNoirAuthorizationProof(circuitId: string, proofData: ProofData): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      circuitId,
      proof: Buffer.from(proofData.proof).toString('base64'),
      noirPublicInputs: proofData.publicInputs,
    } satisfies EncodedNoirAuthorizationProof),
  );
}

/**
 * Decodes SDK proof bytes back into Barretenberg proof data.
 *
 * Verifiers need this because the SDK-level proof object carries human-readable
 * public inputs separately from Barretenberg's field public inputs. Both are
 * checked by the Noir adapter before a proof is accepted.
 */
export function decodeNoirAuthorizationProof(proof: Uint8Array): EncodedNoirAuthorizationProof & { proofData: ProofData } {
  const decoded = JSON.parse(new TextDecoder().decode(proof)) as unknown;

  if (!isRecord(decoded)) {
    throw new TypeError('Invalid Noir authorization proof payload: expected an object.');
  }

  if (typeof decoded.circuitId !== 'string' || decoded.circuitId.length === 0) {
    throw new TypeError('Invalid Noir authorization proof payload: missing circuitId.');
  }

  if (typeof decoded.proof !== 'string' || decoded.proof.length === 0) {
    throw new TypeError('Invalid Noir authorization proof payload: missing proof.');
  }

  if (!Array.isArray(decoded.noirPublicInputs) || !decoded.noirPublicInputs.every((input) => typeof input === 'string')) {
    throw new TypeError('Invalid Noir authorization proof payload: missing Noir public inputs.');
  }

  return {
    circuitId: decoded.circuitId,
    proof: decoded.proof,
    noirPublicInputs: decoded.noirPublicInputs,
    proofData: {
      proof: Buffer.from(decoded.proof, 'base64'),
      publicInputs: decoded.noirPublicInputs,
    },
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
