import assert from 'node:assert/strict';
import test from 'node:test';

import type { AuditEvent, StorageAdapter } from '@0xagentio/core';

import { localOgStorage, type LocalOgStorage } from './local-og-storage.js';

const identity = {
  id: 'agent-alice',
  publicKey: 'agent-public-key-alice',
};

const initialState = {
  cumulativeSpend: 0n,
  updatedAt: new Date('2026-04-25T00:00:00.000Z'),
};

const updatedState = {
  cumulativeSpend: 250n,
  updatedAt: new Date('2026-04-25T12:00:00.000Z'),
};

const auditEvent: AuditEvent = {
  id: 'event-alice-1',
  agentId: identity.id,
  createdAt: new Date('2026-04-25T12:00:01.000Z'),
  status: 'accepted',
  action: {
    type: 'swap',
    amount: 250n,
    metadata: { venue: 'uniswap-demo' },
  },
  execution: {
    success: true,
    reference: 'mock-uniswap-receipt:1',
  },
};

testStorageAdapterContract('localOgStorage', localOgStorage(new Map([[identity.id, initialState]])));

type InspectableStorageAdapter = StorageAdapter & {
  readonly getRecords?: () => readonly { readonly key: string; readonly kind: string; readonly agentId: string; readonly payload: unknown }[];
};

function testStorageAdapterContract(name: string, storage: InspectableStorageAdapter): void {
  test(`${name} satisfies the storage adapter state contract`, async () => {
    assert.deepEqual(await storage.loadState(identity), initialState);

    await storage.saveState(identity, updatedState);

    assert.deepEqual(await storage.loadState(identity), updatedState);
  });

  test(`${name} satisfies the storage adapter audit contract`, async () => {
    await storage.appendAuditEvent(auditEvent);

    const records = storage.getRecords?.();
    if (records !== undefined) {
      assert.equal(records.at(-1)?.key, 'agents/agent-alice/audit/event-alice-1');
      assert.equal(records.at(-1)?.kind, 'audit-event');
      assert.equal(records.at(-1)?.agentId, identity.id);
      assert.deepEqual(records.at(-1)?.payload, auditEvent);
    }
  });

  test(`${name} reports missing agent state instead of inventing defaults`, async () => {
    await assert.rejects(
      storage.loadState({ id: 'agent-missing', publicKey: 'agent-public-key-missing' }),
      /No state found for agent agent-missing\./,
    );
  });
}

// This compile-time assignment keeps the local 0G adapter honest against both
// the public storage contract and its local inspection helpers.
const _localOgStorageContract: LocalOgStorage = localOgStorage();
void _localOgStorageContract;
