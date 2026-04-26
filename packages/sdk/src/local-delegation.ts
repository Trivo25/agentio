import {
  credentialDelegationStatement,
  serializeDelegationStatement,
  type Credential,
  type DelegationSigner,
} from '@0xagentio/core';

const LOCAL_DELEGATION_FORMAT = 'local-delegation-signature';

/**
 * Result returned after checking a local delegation signature.
 */
export type LocalDelegationVerificationResult =
  | {
      readonly valid: true;
    }
  | {
      readonly valid: false;
      readonly reason: 'missing-delegation' | 'unsupported-format' | 'signature-mismatch';
    };

/**
 * Creates a deterministic local signer for examples and tests.
 */
export function localDelegationSigner(principalId: string): DelegationSigner {
  return {
    principalId,
    format: LOCAL_DELEGATION_FORMAT,
    sign(message) {
      return localSignaturePayload(message);
    },
  };
}

/**
 * Verifies credentials signed by `localDelegationSigner`.
 */
export function verifyLocalDelegation(credential: Credential): LocalDelegationVerificationResult {
  if (credential.delegation === undefined) {
    return { valid: false, reason: 'missing-delegation' };
  }

  if (credential.delegation.format !== LOCAL_DELEGATION_FORMAT) {
    return { valid: false, reason: 'unsupported-format' };
  }

  const statement = credentialDelegationStatement(credential, credential.delegation.principalId);
  const expectedSignature = localSignaturePayload(serializeDelegationStatement(statement));

  if (credential.delegation.signature !== expectedSignature) {
    return { valid: false, reason: 'signature-mismatch' };
  }

  return { valid: true };
}

function localSignaturePayload(message: string): string {
  return `${LOCAL_DELEGATION_FORMAT}:${message}`;
}
