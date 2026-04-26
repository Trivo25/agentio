import type { AgentIdentity, AgentMessage, PeerId, ProofAdapter, TransportAdapter } from '@0xagentio/core';

import { onVerifiedMessage, type VerifiedMessageHandlers } from './verified-message.js';

/**
 * Options for creating an agent-scoped peer messaging helper.
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
 * Agent-scoped helper for peer messaging and verified-message listeners.
 */
export type AgentPeer = {
  /** Identity associated with this peer helper. */
  readonly identity: AgentIdentity;
  /** Sends a message to another peer. */
  send(peerId: PeerId, message: AgentMessage): Promise<void>;
  /** Broadcasts a message to all peers supported by the transport. */
  broadcast(message: AgentMessage): Promise<void>;
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

    broadcast(message) {
      return options.transport.broadcast(message);
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
