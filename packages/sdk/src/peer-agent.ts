import type { AgentIdentity, AgentMessage, MessageHandler, PeerId, ProofAdapter, TransportAdapter } from '@0xagentio/core';

import { onVerifiedMessage, type VerifiedMessageHandlers } from './verified-message.js';

/**
 * Options for creating the lower-level peer messaging helper.
 *
 * Use this when an application wants an agent identity to send, request, or
 * listen on a transport without also running the decision/proof loop. The
 * higher-level `createAgentRuntime` uses the same helper when transport is
 * configured.
 */
export type CreateAgentPeerOptions = {
  /** Identity used as the owner of sends, requests, and listeners. */
  readonly identity: AgentIdentity;
  /** Transport adapter that actually delivers or records peer messages. */
  readonly transport: TransportAdapter;
};

/** Compatibility alias for applications still using the previous peer options name. */
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
  /** Expected reply type when the caller wants to ignore unrelated peer traffic. */
  readonly expectedType?: string;
  /** Maximum time to wait before treating the request as unanswered. */
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
  /** Identity that owns this peer communication helper. */
  readonly identity: AgentIdentity;
  /** Sends a message when the caller does not need a correlated response. */
  send(peerId: PeerId, message: AgentMessage): Promise<void>;
  /** Sends a request and resolves with the first reply matching `replyTo` and correlation metadata. */
  request(peerId: PeerId, message: AgentMessage, options?: AgentPeerRequestOptions): Promise<AgentMessage>;
  /** Broadcasts a message when the transport supports fan-out delivery. */
  broadcast(message: AgentMessage): Promise<void>;
  /** Registers this agent as a raw message listener for custom protocol logic. */
  onMessage(handler: MessageHandler): Promise<void> | void;
  /** Registers this agent as a verified-message listener so app code can trust proof-backed payloads. */
  onVerifiedMessage(proofAdapter: ProofAdapter, handlers: VerifiedMessageHandlers): Promise<void> | void;
};

/** Compatibility alias for applications still using the previous peer helper type name. */
export type PeerAgent = AgentPeer;

/**
 * Creates a lower-level peer helper for transport-only agent communication.
 *
 * Choose this helper for custom messaging flows, or use `createAgentRuntime`
 * when the same agent should also own reasoning, proof generation, state, and
 * execution.
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

/** Compatibility alias for `createAgentPeer`. */
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
