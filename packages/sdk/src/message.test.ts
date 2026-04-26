import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentMessage, createAgentReply } from './message.js';

test('createAgentReply links replies to the original request', () => {
  const request = createAgentMessage({
    id: 'quote-request-1',
    correlationId: 'rebalance-session-1',
    type: 'swap-quote-request',
    sender: 'agent-alice',
    createdAt: new Date('2026-04-25T12:00:00.000Z'),
    payload: { assetPair: 'ETH/USDC' },
  });

  const reply = createAgentReply({
    id: 'quote-reply-1',
    type: 'swap-quote-reply',
    sender: 'agent-bob',
    createdAt: new Date('2026-04-25T12:00:01.000Z'),
    request,
    payload: { offeredRatio: '1:3' },
  });

  assert.equal(reply.correlationId, 'rebalance-session-1');
  assert.equal(reply.replyTo, 'quote-request-1');
});
