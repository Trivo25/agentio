import type { AgentMessage, MessageHandler, PeerId, TransportAdapter } from '@0xagentio/core';

/**
 * In-memory transport adapter for local peer-agent examples.
 */
export type LocalTransport = TransportAdapter & {
  /** Returns all messages sent through this adapter. */
  getSentMessages(): readonly { readonly peerId: PeerId; readonly message: AgentMessage }[];
  /** Delivers a message to registered handlers without a network. */
  receive(message: AgentMessage): Promise<void>;
};

/**
 * Creates a local transport with the same shape as future AXL-backed transport.
 */
export function localTransport(): LocalTransport {
  const handlers: MessageHandler[] = [];
  const sentMessages: { peerId: PeerId; message: AgentMessage }[] = [];
  const broadcasts: AgentMessage[] = [];

  return {
    async send(peerId: PeerId, message: AgentMessage): Promise<void> {
      sentMessages.push({ peerId, message });
    },

    async broadcast(message: AgentMessage): Promise<void> {
      broadcasts.push(message);
    },

    onMessage(handler: MessageHandler): void {
      handlers.push(handler);
    },

    getSentMessages(): readonly { readonly peerId: PeerId; readonly message: AgentMessage }[] {
      return sentMessages;
    },

    async receive(message: AgentMessage): Promise<void> {
      for (const handler of handlers) {
        await handler(message);
      }
    },
  };
}
