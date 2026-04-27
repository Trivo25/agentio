import type { AgentIdentity, AgentMessage, MessageHandler, PeerId, ProofAdapter, TransportAdapter } from '@0xagentio/core';

import { onVerifiedMessage, type VerifiedMessageHandlers } from './verified-message.js';

/**
 * Options for creating an agent-scoped peer messaging helper.
 *
 * Use this when an identity needs to participate in peer communication through
 * a transport adapter. The helper keeps send/listen calls attached to a named
 * agent so examples and applications can show who is speaking or listening.
 */
export type CreateAgentPeerOptions = {
  /** Identity of the peer agent using the transport. */
  readonly identity: AgentIdentity;
  /** Transport used by this peer agent. */
  readonly transport: TransportAdapter;
};

/**
 * Compatibility alias for the previous peer helper options name.
 */
export type CreatePeerAgentOptions = CreateAgentPeerOptions;

/**
 * Options for waiting on a reply to a sent message.
 *
 * Use this for simple request/reply flows where an agent asks another agent for
 * a quote, data lookup, or counteroffer and then reasons again from the reply.
 * It intentionally stays small: richer session management can build on top of
 * the same `id`, `correlationId`, and `replyTo` message metadata.
 */
export type AgentPeerRequestOptions = {
  /** Expected reply message type, when the caller wants to ignore unrelated replies. */
  readonly expectedType?: string;
  /** Maximum time to wait for a matching reply before rejecting. */
  readonly timeoutMs?: number;
};

/**
 * Agent-scoped helper for peer messaging and verified-message listeners.
 *
 * Developers use this as the communication surface for a named agent. It keeps
 * low-level transport adapters behind an agent-friendly API while still making
 * explicit whether code is sending raw messages, waiting for replies, or only
 * accepting proof-backed verified messages.
 */
export type AgentPeer = {
  /** Identity associated with this peer helper. */
  readonly identity: AgentIdentity;
  /** Sends a message to another peer without waiting for a response. */
  send(peerId: PeerId, message: AgentMessage): Promise<void>;
  /** Sends a message and resolves with the first matching reply. */
  request(peerId: PeerId, message: AgentMessage, options?: AgentPeerRequestOptions): Promise<AgentMessage>;
  /** Broadcasts a message to all peers supported by the transport. */
  broadcast(message: AgentMessage): Promise<void>;
  /** Registers this peer agent as a listener for raw incoming messages. */
  onMessage(handler: MessageHandler): Promise<void> | void;
  /** Registers this peer agent as a listener for proof-backed messages. */
  onVerifiedMessage(proofAdapter: ProofAdapter, handlers: VerifiedMessageHandlers): Promise<void> | void;
};

/**
 * Compatibility alias for the previous peer helper type name.
 */
export type PeerAgent = AgentPeer;

/**
 * Creates an agent-scoped peer helper so listener ownership is explicit.
 */
export function createAgentPeer(options: CreateAgentPeerOptions): AgentPeer {
  return {
    identity: options.identity,

    send(peerId, message) {
      return options.transport.send(peerId, message);
    },

    request(peerId, message, requestOptions) {
      return requestPeer(options.transport, peerId, message, requestOptions);
    },

    broadcast(message) {
      return options.transport.broadcast(message);
    },

    onMessage(handler) {
      return options.transport.onMessage(handler);
    },

    onVerifiedMessage(proofAdapter, handlers) {
      return onVerifiedMessage(options.transport, proofAdapter, handlers);
    },
  };
}

/**
 * Compatibility alias for createAgentPeer.
 */
export const createPeerAgent = createAgentPeer;

function requestPeer(
  transport: TransportAdapter,
  peerId: PeerId,
  message: AgentMessage,
  options: AgentPeerRequestOptions = {},
): Promise<AgentMessage> {
  const expectedCorrelationId = message.correlationId ?? message.id;
  const expectedReplyTo = message.id;
  const timeoutMs = options.timeoutMs ?? 5_000;

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      reject(new Error(`Timed out waiting for reply to ${expectedReplyTo ?? message.type}.`));
    }, timeoutMs);

    transport.onMessage((reply) => {
      if (settled || !isExpectedReply(reply, expectedCorrelationId, expectedReplyTo, options.expectedType)) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(reply);
    });

    transport.send(peerId, message).catch((error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function isExpectedReply(
  reply: AgentMessage,
  expectedCorrelationId: string | undefined,
  expectedReplyTo: string | undefined,
  expectedType: string | undefined,
): boolean {
  if (expectedType !== undefined && reply.type !== expectedType) {
    return false;
  }

  if (expectedReplyTo !== undefined && reply.replyTo !== expectedReplyTo) {
    return false;
  }

  return expectedCorrelationId === undefined || reply.correlationId === expectedCorrelationId;
}
