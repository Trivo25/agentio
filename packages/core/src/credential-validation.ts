import type { Credential } from './credential.js';
import { hashPolicy } from './policy-commitment.js';
import type { Policy } from './policy.js';
import type { ValidationIssue, ValidationResult } from './validation.js';
import { invalidResult, validResult } from './validation.js';

/**
 * Validates that a credential is bound to the supplied policy at the provided time.
 */
export function validateCredentialForPolicy(credential: Credential, policy: Policy, now: Date): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (credential.policyId !== policy.id) {
    issues.push({
      code: 'credential-policy-id-mismatch',
      message: `Credential ${credential.id} is bound to policy ${credential.policyId}, not policy ${policy.id}.`,
    });
  }

  const policyHash = hashPolicy(policy);
  if (credential.policyHash !== policyHash) {
    issues.push({
      code: 'credential-policy-hash-mismatch',
      message: `Credential ${credential.id} policy hash does not match policy ${policy.id}.`,
    });
  }

  if (credential.expiresAt.getTime() <= now.getTime()) {
    issues.push({
      code: 'credential-expired',
      message: `Credential ${credential.id} is expired.`,
    });
  }

  return issues.length === 0 ? validResult() : invalidResult(...issues);
}
