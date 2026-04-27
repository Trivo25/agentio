import type { OgObjectClient, OgPutObjectResult } from './index.js';

/**
 * In-memory implementation of the 0G object-client contract.
 *
 * This is not a production 0G backend. It gives examples and tests the same
 * get/put semantics as the future 0G SDK wrapper, so developers can exercise
 * `ogStorage({ client })` without credentials, network writes, or testnet
 * setup while we keep the real storage adapter boundary stable.
 */
export type MemoryOgObjectClient = OgObjectClient & {
  /** Returns a deterministic snapshot of persisted objects for examples and assertions. */
  readonly entries: () => readonly MemoryOgObjectEntry[];
  /** Clears all in-memory objects so tests can reuse the same client safely. */
  readonly clear: () => void;
};

/** Object stored by the memory 0G client test double. */
export type MemoryOgObjectEntry = {
  readonly key: string;
  readonly value: string;
};

/**
 * Creates a local test double for the 0G object client.
 *
 * Use this when you want to demonstrate or test the real `ogStorage()` adapter
 * shape before wiring live 0G credentials. Production apps should replace this
 * with a client backed by the official 0G SDK while leaving the agent runtime
 * unchanged.
 */
export function memoryOgObjectClient(initialObjects?: Iterable<readonly [string, string]>): MemoryOgObjectClient {
  const objects = new Map(initialObjects);

  return {
    async getObject(key: string): Promise<string | undefined> {
      return objects.get(key);
    },

    async putObject(key: string, value: string): Promise<OgPutObjectResult> {
      objects.set(key, value);
      return { reference: `memory-og://${key}` };
    },

    entries(): readonly MemoryOgObjectEntry[] {
      return [...objects.entries()].map(([key, value]) => ({ key, value }));
    },

    clear(): void {
      objects.clear();
    },
  };
}
