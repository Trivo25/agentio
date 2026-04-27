import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuditEvent } from '@0xagentio/core';
import { agentStateKey, decodeAgentStateDocument, namespacedKey, ogStorage, type OgObjectClient } from './index.js';

test('ogStorage explains that a real 0G client is required', async () => {
  const storage = ogStorage({ namespace: 'agentio-test' });

  await assert.rejects(
    storage.loadState({ id: 'agent-alice', publicKey: 'agent-public-key-alice' }),
    /needs an OgObjectClient/,
  );
});

test('ogStorage persists state through an injected object client', async () => {
  const objects = new Map<string, string>();
  const storage = ogStorage({ namespace: 'agentio-test', client: mapObjectClient(objects) });
  const identity = { id: 'agent-alice', publicKey: 'agent-public-key-alice' };
  const state = { cumulativeSpend: 250n, updatedAt: new Date('2026-04-25T12:00:00.000Z') };

  await storage.saveState(identity, state);

  assert.equal(objects.size, 1);
  assert.equal([...objects.keys()][0], 'agentio-test/agents/agent-alice/state/latest');
  assert.deepEqual(await storage.loadState(identity), state);
});

test('ogStorage appends audit events under stable namespaced keys', async () => {
  const objects = new Map<string, string>();
  const storage = ogStorage({ namespace: 'agentio-test', client: mapObjectClient(objects) });
  const event: AuditEvent = {
    id: 'event-1',
    agentId: 'agent-alice',
    createdAt: new Date('2026-04-25T12:00:00.000Z'),
    status: 'accepted',
    action: { type: 'swap', amount: 250n },
  };

  await storage.appendAuditEvent(event);

  assert.equal([...objects.keys()][0], 'agentio-test/agents/agent-alice/audit/event-1');
  assert.match([...objects.values()][0] ?? '', /"kind":"audit-event"/);
});

test('0G storage helpers keep keys and document decoding deterministic', () => {
  assert.equal(agentStateKey('agent-alice'), 'agents/agent-alice/state/latest');
  assert.equal(namespacedKey('/agentio-test/', agentStateKey('agent-alice')), 'agentio-test/agents/agent-alice/state/latest');

  const decoded = decodeAgentStateDocument(
    '{"version":1,"kind":"agent-state","agentId":"agent-alice","createdAt":"2026-04-25T12:00:00.000Z","payload":{"cumulativeSpend":{"$type":"bigint","value":"5"},"updatedAt":{"$type":"date","value":"2026-04-25T12:00:00.000Z"}}}',
  );

  assert.deepEqual(decoded, { cumulativeSpend: 5n, updatedAt: new Date('2026-04-25T12:00:00.000Z') });
});

function mapObjectClient(objects: Map<string, string>): OgObjectClient {
  return {
    async getObject(key) {
      return objects.get(key);
    },
    async putObject(key, value) {
      objects.set(key, value);
      return { reference: key };
    },
  };
}
