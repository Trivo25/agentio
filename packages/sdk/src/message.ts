import type { ActionIntent, AgentMessage, AgentState, Credential, PeerId, Policy, ProofAdapter } from '@0xagentio/core';

/**
 * Options for creating a correlated agent message.
 *
 * Use this for ordinary agent-to-agent messages when the message should be easy
 * to trace across logs and replies. The `id`, `correlationId`, and `replyTo`
 * fields are intentionally small because transports such as AXL may provide the
 * delivery layer while the SDK keeps conversation metadata portable.
 */
export type CreateAgentMessageOptions = {
  /** Stable message id used by replies and logs. */
  readonly id: string;
  /** Application or protocol-specific message type. */
  readonly type: string;
  /** Agent sending the message. */
  readonly sender: PeerId;
  /** Message creation time. */
  readonly createdAt: Date;
  /** Application payload carried by the message. */
  readonly payload: Readonly<Record<string, unknown>>;
  /** Conversation id shared by related requests and replies. */
  readonly correlationId?: string;
  /** Message id this message replies to, when applicable. */
  readonly replyTo?: string;
};

/**
 * Agent message that always carries a stable id.
 *
 * Developers can use this shape for request/reply flows where later messages
 * need to reference the original message. It still remains compatible with the
 * core `AgentMessage` transport contract.
 */
export type CorrelatedAgentMessage = AgentMessage & {
  readonly id: string;
};

/**
 * Creates an agent message with a stable id and optional request/reply metadata.
 *
 * This helper keeps examples and applications from hand-writing the same
 * message envelope repeatedly. It does not add authorization by itself; use
 * `createProofBackedMessage` when the receiver should verify delegated authority
 * before trusting or acting on the message.
 */
export function createAgentMessage(options: CreateAgentMessageOptions): CorrelatedAgentMessage {
  return {
    id: options.id,
    type: options.type,
    sender: options.sender,
    createdAt: options.createdAt,
    payload: options.payload,
    correlationId: options.correlationId,
    replyTo: options.replyTo,
  };
}

/**
 * Options for creating a proof-backed agent message.
 *
 * Use this when a message asks another agent or adapter to spend work, reveal
 * data, or perform an action. The helper proves the supplied action and embeds
 * the proof next to the action so receivers can call `verifyMessageAction`
 * before replying or executing.
 */
export type CreateProofBackedMessageOptions = Omit<CreateAgentMessageOptions, 'payload'> & {
  /** Credential proving which delegated agent authority is being used. */
  readonly credential: Credential;
  /** Policy that constrains the action being attached to the message. */
  readonly policy: Policy;
  /** Current state snapshot used by budget-aware policies and proof adapters. */
  readonly state: AgentState;
  /** Action the sender wants the receiver to authorize from the proof. */
  readonly action: ActionIntent;
  /** Proof adapter that creates the authorization proof for the action. */
  readonly proof: ProofAdapter;
  /** Time used for expiry checks and proof inputs. */
  readonly now: Date;
  /** Extra application fields to include alongside `action` and `proof`. */
  readonly payload?: Readonly<Record<string, unknown>>;
};

/**
 * Creates a correlated message that carries an action authorization proof.
 *
 * This is the safe default for requests such as quotes, tool calls, and executor
 * requests. It keeps the action and proof in a standard payload location so an
 * external agent can verify the message without knowing how the sender built
 * the proof.
 */
export async function createProofBackedMessage(
  options: CreateProofBackedMessageOptions,
): Promise<CorrelatedAgentMessage> {
  const proofResult = await options.proof.proveAction({
    credential: options.credential,
    policy: options.policy,
    state: options.state,
    action: options.action,
    now: options.now,
  });

  return createAgentMessage({
    id: options.id,
    type: options.type,
    sender: options.sender,
    createdAt: options.createdAt,
    correlationId: options.correlationId,
    replyTo: options.replyTo,
    payload: {
      ...options.payload,
      action: options.action,
      proof: proofResult.proof,
    },
  });
}

/**
 * Options for creating a reply to a correlated agent message.
 *
 * Replies should carry the original correlation id so multi-round agents can
 * group messages from the same task or negotiation without relying on transport
 * implementation details.
 */
export type CreateAgentReplyOptions = Omit<CreateAgentMessageOptions, 'correlationId' | 'replyTo'> & {
  /** Request message being answered. */
  readonly request: CorrelatedAgentMessage;
};

/**
 * Creates a reply message linked to the original request id and correlation id.
 *
 * Use this for responses such as quotes, counteroffers, data lookups, or tool
 * results. The receiver can inspect `replyTo` to connect the response to the
 * exact request that caused it.
 */
export function createAgentReply(options: CreateAgentReplyOptions): CorrelatedAgentMessage {
  return createAgentMessage({
    id: options.id,
    type: options.type,
    sender: options.sender,
    createdAt: options.createdAt,
    payload: options.payload,
    correlationId: options.request.correlationId ?? options.request.id,
    replyTo: options.request.id,
  });
}
