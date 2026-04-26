/**
 * Identifier for another agent or node reachable through a transport adapter.
 */
export type PeerId = string;

/**
 * Generic message exchanged between agents.
 */
export type AgentMessage = {
  /** Stable message id used by replies and logs, when the protocol needs one. */
  readonly id?: string;
  /** Conversation id shared by related requests and replies. */
  readonly correlationId?: string;
  /** Message id this message replies to, when applicable. */
  readonly replyTo?: string;
  /** Application or protocol-specific message type. */
  readonly type: string;
  /** Sender agent or peer identifier. */
  readonly sender: PeerId;
  /** Message creation time. */
  readonly createdAt: Date;
  /** Message body defined by the caller or adapter package. */
  readonly payload: Readonly<Record<string, unknown>>;
};

/**
 * Handles messages received from another agent or peer.
 */
export type MessageHandler = (message: AgentMessage) => Promise<void> | void;

/**
 * Pluggable transport backend for peer-to-peer agent communication.
 */
export interface TransportAdapter {
  /** Sends a message to one peer. */
  send(peerId: PeerId, message: AgentMessage): Promise<void>;
  /** Broadcasts a message to all peers supported by the adapter. */
  broadcast(message: AgentMessage): Promise<void>;
  /** Registers a handler for incoming messages. */
  onMessage(handler: MessageHandler): Promise<void> | void;
}
