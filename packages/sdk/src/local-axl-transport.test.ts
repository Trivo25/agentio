import assert from 'node:assert/strict';
import test from 'node:test';

import { localAxlTransport } from './local-axl-transport.js';

const message = {
  type: 'credential-present',
  sender: 'agent-alice',
  createdAt: new Date('2026-04-25T12:00:00.000Z'),
  payload: { status: 'ready' },
};

test('localAxlTransport records sent messages as AXL-shaped envelopes', async () => {
  const transport = localAxlTransport('agentio/test');

  await transport.send('agent-bob', message);

  assert.deepEqual(transport.getEnvelopes(), [
    {
      recipient: 'agent-bob',
      sender: 'agent-alice',
      topic: 'agentio/test',
      createdAt: new Date('2026-04-25T12:00:00.000Z'),
      message,
    },
  ]);
});

test('localAxlTransport records broadcasts as broadcast envelopes', async () => {
  const transport = localAxlTransport();

  await transport.broadcast(message);

  assert.equal(transport.getEnvelopes()[0]?.recipient, 'broadcast');
  assert.equal(transport.getEnvelopes()[0]?.topic, 'agentio/messages');
});

test('localAxlTransport delivers received messages to handlers', async () => {
  const transport = localAxlTransport();
  const received: unknown[] = [];

  transport.onMessage((message) => {
    received.push(message);
  });

  await transport.receive(message);

  assert.deepEqual(received, [message]);
});
