import type { AgentMessage, MessageHandler, PeerId, TransportAdapter } from '@0xagentio/core';

/**
 * Local envelope shaped like a Gensyn AXL-style message delivery.
 */
export type LocalAxlEnvelope = {
  /** Peer receiving the message, or `broadcast` for local broadcast records. */
  readonly recipient: PeerId | 'broadcast';
  /** Sender declared by the agent message. */
  readonly sender: PeerId;
  /** AXL-style topic for routing protocol or application messages. */
  readonly topic: string;
  /** Message creation time copied from the agent message. */
  readonly createdAt: Date;
  /** Message carried over the local AXL-shaped transport. */
  readonly message: AgentMessage;
};

/**
 * In-memory transport adapter that records Gensyn AXL-shaped envelopes.
 */
export type LocalAxlTransport = TransportAdapter & {
  /** Returns all local AXL-shaped envelopes in send order. */
  getEnvelopes(): readonly LocalAxlEnvelope[];
  /** Delivers a message to registered handlers without a network. */
  receive(message: AgentMessage): Promise<void>;
};

/**
 * Creates a local AXL-shaped transport adapter for examples and adapter-boundary tests.
 */
export function localAxlTransport(topic = 'agentio/messages'): LocalAxlTransport {
  const handlers: MessageHandler[] = [];
  const envelopes: LocalAxlEnvelope[] = [];

  return {
    async send(peerId: PeerId, message: AgentMessage): Promise<void> {
      envelopes.push(createEnvelope(peerId, message, topic));
    },

    async broadcast(message: AgentMessage): Promise<void> {
      envelopes.push(createEnvelope('broadcast', message, topic));
    },

    onMessage(handler: MessageHandler): void {
      handlers.push(handler);
    },

    getEnvelopes(): readonly LocalAxlEnvelope[] {
      return envelopes;
    },

    async receive(message: AgentMessage): Promise<void> {
      for (const handler of handlers) {
        await handler(message);
      }
    },
  };
}

function createEnvelope(recipient: PeerId | 'broadcast', message: AgentMessage, topic: string): LocalAxlEnvelope {
  return {
    recipient,
    sender: message.sender,
    topic,
    createdAt: message.createdAt,
    message,
  };
}
