import assert from 'node:assert/strict';
import test from 'node:test';

import type { AgentMessage, TransportAdapter } from '@0xagentio/core';

import { localAxlTransport, type LocalAxlTransport } from './local-axl-transport.js';

const request: AgentMessage = {
  id: 'quote-request-1',
  correlationId: 'rebalance-session-1',
  type: 'swap-quote-request',
  sender: 'agent-alice',
  createdAt: new Date('2026-04-25T12:00:00.000Z'),
  payload: { status: 'requesting-quote' },
};

const reply: AgentMessage = {
  id: 'quote-reply-1',
  correlationId: 'rebalance-session-1',
  replyTo: 'quote-request-1',
  type: 'swap-quote-reply',
  sender: 'agent-bob',
  createdAt: new Date('2026-04-25T12:00:01.000Z'),
  payload: { offeredOutputPerInput: 3 },
};

testTransportAdapterContract('localAxlTransport', localAxlTransport('agentio/contract'));

type InspectableTransportAdapter = TransportAdapter & {
  readonly getEnvelopes?: () => readonly { readonly recipient: string; readonly topic: string; readonly message: AgentMessage }[];
  readonly receive?: (message: AgentMessage) => Promise<void>;
};

function testTransportAdapterContract(name: string, transport: InspectableTransportAdapter): void {
  test(`${name} records directed sends without changing the message`, async () => {
    await transport.send('agent-bob', request);

    const envelopes = transport.getEnvelopes?.();
    if (envelopes !== undefined) {
      assert.equal(envelopes.at(-1)?.recipient, 'agent-bob');
      assert.equal(envelopes.at(-1)?.topic, 'agentio/contract');
      assert.equal(envelopes.at(-1)?.message, request);
    }
  });

  test(`${name} records broadcasts without changing the message`, async () => {
    await transport.broadcast(request);

    const envelopes = transport.getEnvelopes?.();
    if (envelopes !== undefined) {
      assert.equal(envelopes.at(-1)?.recipient, 'broadcast');
      assert.equal(envelopes.at(-1)?.message, request);
    }
  });

  test(`${name} delivers correlated replies to registered handlers`, async () => {
    const received: AgentMessage[] = [];

    transport.onMessage((message) => {
      if (message.replyTo === request.id && message.correlationId === request.correlationId) {
        received.push(message);
      }
    });

    await transport.receive?.(reply);

    assert.deepEqual(received, [reply]);
  });
}

// This compile-time assignment keeps the local AXL adapter honest against both
// the public transport contract and its local inspection helpers.
const _localAxlTransportContract: LocalAxlTransport = localAxlTransport();
void _localAxlTransportContract;
