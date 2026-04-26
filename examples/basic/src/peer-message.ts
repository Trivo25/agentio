import { localTransport } from '@0xagentio/sdk';

import { toJsonSafe } from './json.js';

// This example demonstrates the local peer-communication seam.
// The same TransportAdapter shape will later be implemented by Gensyn AXL,
// so agent-to-agent examples can move from memory to real P2P transport.

const transport = localTransport();
const receivedMessages: unknown[] = [];

transport.onMessage((message) => {
  receivedMessages.push(message);
});

const message = {
  type: 'credential-present',
  sender: 'agent-alice',
  createdAt: new Date('2026-04-25T12:00:00.000Z'),
  payload: {
    credentialId: 'credential-basic',
    actionType: 'swap',
  },
};

await transport.send('agent-bob', message);
await transport.receive(message);

console.log(
  JSON.stringify(
    toJsonSafe({
      sentMessages: transport.getSentMessages(),
      receivedMessages,
    }),
    null,
    2,
  ),
);
