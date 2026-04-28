import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuditEvent } from '@0xagentio/core';
import { agentStateKey, decodeAgentStateDocument, memoryOgObjectClient, namespacedKey, ogStorage } from './index.js';

test('ogStorage explains that a real 0G client is required', async () => {
  const storage = ogStorage({ namespace: 'agentio-test' });

  await assert.rejects(
    storage.loadState({ id: 'agent-alice', publicKey: 'agent-public-key-alice' }),
    /needs an OgObjectClient/,
  );
});

test('ogStorage persists state through an injected object client', async () => {
  const client = memoryOgObjectClient();
  const storage = ogStorage({ namespace: 'agentio-test', client });
  const identity = { id: 'agent-alice', publicKey: 'agent-public-key-alice' };
  const state = { cumulativeSpend: 250n, updatedAt: new Date('2026-04-25T12:00:00.000Z') };

  await storage.saveState(identity, state);

  assert.equal(client.entries().length, 1);
  assert.equal(client.entries()[0]?.key, 'agentio-test/agents/agent-alice/state/latest');
  assert.deepEqual(await storage.loadState(identity), state);
});

test('ogStorage appends audit events under stable namespaced keys', async () => {
  const client = memoryOgObjectClient();
  const storage = ogStorage({ namespace: 'agentio-test', client });
  const event: AuditEvent = {
    id: 'event-1',
    agentId: 'agent-alice',
    createdAt: new Date('2026-04-25T12:00:00.000Z'),
    status: 'accepted',
    action: { type: 'swap', amount: 250n },
  };

  await storage.appendAuditEvent(event);

  assert.equal(client.entries()[0]?.key, 'agentio-test/agents/agent-alice/audit/event-1');
  assert.match(client.entries()[0]?.value ?? '', /"kind":"audit-event"/);
});

test('0G storage helpers keep keys and document decoding deterministic', () => {
  assert.equal(agentStateKey('agent-alice'), 'agents/agent-alice/state/latest');
  assert.equal(namespacedKey('/agentio-test/', agentStateKey('agent-alice')), 'agentio-test/agents/agent-alice/state/latest');

  const decoded = decodeAgentStateDocument(
    '{"version":1,"kind":"agent-state","agentId":"agent-alice","createdAt":"2026-04-25T12:00:00.000Z","payload":{"cumulativeSpend":{"$type":"bigint","value":"5"},"updatedAt":{"$type":"date","value":"2026-04-25T12:00:00.000Z"}}}',
  );

  assert.deepEqual(decoded, { cumulativeSpend: 5n, updatedAt: new Date('2026-04-25T12:00:00.000Z') });
});

test('memoryOgObjectClient exposes local objects and can be cleared', async () => {
  const client = memoryOgObjectClient([['existing-key', 'existing-value']]);

  assert.equal(await client.getObject('existing-key'), 'existing-value');
  assert.deepEqual(client.entries(), [{ key: 'existing-key', value: 'existing-value' }]);

  await client.putObject('new-key', 'new-value');
  assert.equal(await client.getObject('new-key'), 'new-value');
  assert.equal(client.entries().length, 2);

  client.clear();
  assert.deepEqual(client.entries(), []);
});
