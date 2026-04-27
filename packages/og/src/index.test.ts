import assert from 'node:assert/strict';
import test from 'node:test';
import { ogStorage } from './index.js';

test('ogStorage exposes the future StorageAdapter boundary without pretending to persist yet', async () => {
  const storage = ogStorage({ namespace: 'agentio-test' });

  await assert.rejects(
    storage.loadState({ id: 'agent-alice', publicKey: 'agent-public-key-alice' }),
    /real 0G storage adapter is not implemented yet/,
  );

  await assert.rejects(
    storage.saveState(
      { id: 'agent-alice', publicKey: 'agent-public-key-alice' },
      { cumulativeSpend: 0n, updatedAt: new Date('2026-04-25T00:00:00.000Z') },
    ),
    /real 0G storage adapter is not implemented yet/,
  );
});
