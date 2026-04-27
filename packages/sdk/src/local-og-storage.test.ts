import assert from 'node:assert/strict';
import test from 'node:test';

import { localOgStorage } from './local-og-storage.js';

const identity = {
  id: 'agent-test',
  publicKey: 'agent-public-key-test',
};

const state = {
  cumulativeSpend: 100n,
  updatedAt: new Date('2026-04-25T00:00:00.000Z'),
};

test('localOgStorage saves state using a 0G-shaped object key', async () => {
  const storage = localOgStorage();

  await storage.saveState(identity, state);

  assert.deepEqual(await storage.loadState(identity), state);
  assert.equal(storage.getRecords()[0]?.key, 'agents/agent-test/state/latest');
  assert.equal(storage.getRecords()[0]?.kind, 'agent-state');
  assert.equal(storage.getRecords()[0]?.agentId, 'agent-test');
  assert.deepEqual(storage.getRecords()[0]?.payload, state);
});

test('localOgStorage appends audit events using 0G-shaped object keys', async () => {
  const storage = localOgStorage();
  const event = {
    id: 'event-test',
    agentId: 'agent-test',
    createdAt: new Date('2026-04-25T12:00:00.000Z'),
    status: 'accepted' as const,
  };

  await storage.appendAuditEvent(event);

  assert.equal(storage.getRecords()[0]?.key, 'agents/agent-test/audit/event-test');
  assert.equal(storage.getRecords()[0]?.kind, 'audit-event');
  assert.deepEqual(storage.getAuditEvents(), [event]);
});
