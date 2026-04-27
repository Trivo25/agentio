import assert from 'node:assert/strict';
import test from 'node:test';

import type { AgentMessage } from '@0xagentio/core';

import { localTransport } from './local-transport.js';
import { createAgentPeer, createPeerAgent } from './peer-agent.js';

const identity = {
  id: 'agent-carol-auditor',
  publicKey: 'agent-public-key-carol-auditor',
};

const message: AgentMessage = {
  type: 'rebalance-executed',
  sender: 'agent-alice',
  createdAt: new Date('2026-04-25T12:00:00.000Z'),
  payload: {},
};

test('createAgentPeer scopes sends to a named agent identity', async () => {
  const sent: unknown[] = [];
  const handlers: unknown[] = [];
  const transport = {
    async send(peerId: string, sentMessage: AgentMessage) {
      sent.push({ peerId, message: sentMessage });
    },
    async broadcast() {},
    onMessage(handler: unknown) {
      handlers.push(handler);
    },
  };
  const carol = createAgentPeer({ identity, transport });

  await carol.send('agent-bob', message);
  carol.onMessage(() => {});

  assert.equal(carol.identity.id, 'agent-carol-auditor');
  assert.deepEqual(sent, [{ peerId: 'agent-bob', message }]);
  assert.equal(handlers.length, 1);
});

test('createPeerAgent remains a compatibility alias', () => {
  assert.equal(createPeerAgent, createAgentPeer);
});


test('AgentPeer request resolves a correlated reply', async () => {
  const transport = localTransport();
  const alice = createAgentPeer({ identity, transport });
  const request: AgentMessage = {
    id: 'quote-request-1',
    correlationId: 'rebalance-session-1',
    type: 'swap-quote-request',
    sender: identity.id,
    createdAt: new Date('2026-04-25T12:00:00.000Z'),
    payload: {},
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

  const pendingReply = alice.request('agent-bob', request, { expectedType: 'swap-quote-reply', timeoutMs: 100 });
  await transport.receive(reply);

  assert.equal(await pendingReply, reply);
  assert.deepEqual(transport.getSentMessages(), [{ peerId: 'agent-bob', message: request }]);
});
