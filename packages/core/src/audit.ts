import type { ActionIntent } from './action.js';
import type { ValidationIssue } from './validation.js';

/**
 * Action lifecycle status recorded by an audit event.
 */
export type AuditStatus = 'accepted' | 'rejected' | 'skipped';

/**
 * Records the outcome of one agent decision cycle.
 */
export type AuditEvent = {
  /** Unique event identifier. */
  readonly id: string;
  /** Identifier of the agent that produced this event. */
  readonly agentId: string;
  /** Event creation time. */
  readonly createdAt: Date;
  /** Outcome status for the decision cycle. */
  readonly status: AuditStatus;
  /** Action proposed by the reasoning engine, if one was proposed. */
  readonly action?: ActionIntent;
  /** Validation issues explaining a rejection, if any. */
  readonly issues?: readonly ValidationIssue[];
};
