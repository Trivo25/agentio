import assert from 'node:assert/strict';
import test from 'node:test';

import type { AgentMessage } from '@0xagentio/core';

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
