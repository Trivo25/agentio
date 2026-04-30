import assert from 'node:assert/strict';
import test from 'node:test';

import type { AxlClient, AxlReceivedMessage, AxlSendInput, AxlSendResult, AxlTopology } from '@0xagentio/axl-client';
import type { AgentMessage } from '@0xagentio/core';

import { axlTransport, decodeAgentMessage, encodeAgentMessage } from './index.js';

test('encodeAgentMessage and decodeAgentMessage preserve the AgentIO wire shape', () => {
  const message = createMessage({ id: 'm1', correlationId: 'c1', replyTo: 'r1' });

  const decoded = decodeAgentMessage(encodeAgentMessage(message));

  assert.deepEqual(decoded, message);
});

test('axlTransport sends encoded AgentIO messages through the AXL client', async () => {
  const client = fakeAxlClient();
  const transport = axlTransport({ client });
  const message = createMessage({ id: 'send-1' });

  await transport.send('bob-peer', message);

  assert.equal(client.sent.length, 1);
  assert.equal(client.sent[0]?.peerId, 'bob-peer');
  assert.deepEqual(decodeAgentMessage(client.sent[0]?.body ?? new Uint8Array()), message);
  transport.stop();
});

test('axlTransport polls received AXL messages and dispatches decoded AgentIO messages', async () => {
  const client = fakeAxlClient();
  const message = createMessage({ id: 'incoming-1' });
  client.incoming.push({ fromPeerId: 'alice-transport-id', body: encodeAgentMessage(message) });

  const received: AgentMessage[] = [];
  const transport = axlTransport({ client, pollIntervalMs: 5 });
  transport.onMessage((incoming) => {
    received.push(incoming);
  });

  await waitFor(() => received.length === 1);

  assert.deepEqual(received, [message]);
  transport.stop();
});

test('axlTransport reports decode errors without stopping future polls', async () => {
  const client = fakeAxlClient();
  const errors: unknown[] = [];
  const validMessage = createMessage({ id: 'valid-after-error' });
  client.incoming.push(
    { fromPeerId: 'bad', body: new TextEncoder().encode('not-json') },
    { fromPeerId: 'good', body: encodeAgentMessage(validMessage) },
  );

  const received: AgentMessage[] = [];
  const transport = axlTransport({ client, pollIntervalMs: 5, onError: (error) => errors.push(error) });
  transport.onMessage((incoming) => {
    received.push(incoming);
  });

  await waitFor(() => errors.length === 1);
  await waitFor(() => received.length === 1);

  assert.equal(errors.length, 1);
  assert.deepEqual(received, [validMessage]);
  transport.stop();
});


test('axlTransport suppresses receive errors after stop', async () => {
  const errors: unknown[] = [];
  let rejectRecv: ((error: unknown) => void) | undefined;
  let recvStarted = false;
  const client: FakeAxlClient = {
    ...fakeAxlClient(),
    async recv(): Promise<AxlReceivedMessage | undefined> {
      recvStarted = true;
      return new Promise((_, reject) => {
        rejectRecv = reject;
      });
    },
  };
  const transport = axlTransport({ client, pollIntervalMs: 5, onError: (error) => errors.push(error) });

  transport.onMessage(() => undefined);
  await waitFor(() => recvStarted && rejectRecv !== undefined);
  transport.stop();
  rejectRecv?.(new Error('node stopped'));
  await delay(10);

  assert.deepEqual(errors, []);
});

test('axlTransport broadcast sends to configured peers', async () => {
  const client = fakeAxlClient();
  const transport = axlTransport({ client, broadcastPeers: ['bob', 'carol'] });
  const message = createMessage({ id: 'broadcast-1' });

  await transport.broadcast(message);

  assert.deepEqual(
    client.sent.map((send) => send.peerId),
    ['bob', 'carol'],
  );
  assert.deepEqual(client.sent.map((send) => decodeAgentMessage(send.body)), [message, message]);
  transport.stop();
});

test('axlTransport rejects broadcast when no broadcast peers are configured', async () => {
  const transport = axlTransport({ client: fakeAxlClient() });

  await assert.rejects(transport.broadcast(createMessage({ id: 'broadcast-missing' })), /broadcast peer/);
  transport.stop();
});

function createMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: 'message-1',
    type: 'quote.request',
    sender: 'alice-agent',
    createdAt: new Date('2026-04-28T00:00:00.000Z'),
    payload: {
      tokenIn: 'ETH',
      tokenOut: 'USDC',
      amount: 1n,
      proof: new Uint8Array([1, 2, 3]),
    },
    ...overrides,
  };
}

type FakeAxlClient = AxlClient & {
  readonly incoming: AxlReceivedMessage[];
  readonly sent: AxlSendInput[];
};

function fakeAxlClient(): FakeAxlClient {
  const incoming: AxlReceivedMessage[] = [];
  const sent: AxlSendInput[] = [];

  return {
    incoming,
    sent,
    async getTopology(): Promise<AxlTopology> {
      return { ourPublicKey: 'fake-public-key', raw: {} };
    },
    async send(input: AxlSendInput): Promise<AxlSendResult> {
      sent.push(input);
      return { sentBytes: input.body.byteLength };
    },
    async recv(): Promise<AxlReceivedMessage | undefined> {
      return incoming.shift();
    },
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (predicate()) {
      return;
    }
    await delay(5);
  }
  throw new Error('Timed out waiting for predicate.');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
