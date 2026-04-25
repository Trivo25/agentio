/**
 * Machine-readable validation issue code.
 */
export type ValidationIssueCode = 'policy-expired' | 'action-not-allowed';

/**
 * Describes why validation failed.
 */
export type ValidationIssue = {
  /** Stable issue code suitable for programmatic handling. */
  readonly code: ValidationIssueCode;
  /** Human-readable explanation suitable for logs and examples. */
  readonly message: string;
};

/**
 * Result returned by validation functions that may collect one or more issues.
 */
export type ValidationResult =
  | {
      readonly valid: true;
      readonly issues: readonly [];
    }
  | {
      readonly valid: false;
      readonly issues: readonly ValidationIssue[];
    };

/**
 * Creates a successful validation result.
 */
export function validResult(): ValidationResult {
  return { valid: true, issues: [] };
}

/**
 * Creates a failed validation result from one or more issues.
 */
export function invalidResult(...issues: readonly ValidationIssue[]): ValidationResult {
  return { valid: false, issues };
}
