import { localTransport } from '@0xagentio/sdk';

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

function toJsonSafe(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(toJsonSafe);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, toJsonSafe(nestedValue)]),
    );
  }

  return value;
}
