import type { AgentMessage, PeerId } from '@0xagentio/core';

/**
 * Options for creating a correlated agent message.
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
 */
export type CorrelatedAgentMessage = AgentMessage & {
  readonly id: string;
};

/**
 * Creates an agent message with a stable id and optional request/reply metadata.
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
 * Options for creating a reply to a correlated agent message.
 */
export type CreateAgentReplyOptions = Omit<CreateAgentMessageOptions, 'correlationId' | 'replyTo'> & {
  /** Request message being answered. */
  readonly request: CorrelatedAgentMessage;
};

/**
 * Creates a reply message linked to the original request id and correlation id.
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
