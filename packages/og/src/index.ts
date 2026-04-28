import type { AgentIdentity, AgentState, AuditEvent, StorageAdapter } from '@0xagentio/core';
import { decodeAgentStateDocument, encodeAgentStateDocument, encodeAuditEventDocument } from './codec.js';
import { agentStateKey, auditEventKey, namespacedKey } from './keys.js';

/**
 * Minimal object client needed by the 0G storage adapter.
 *
 * The official 0G TypeScript SDK can be wrapped behind this shape with either
 * file upload/download or KV operations. Keeping the SDK adapter on this small
 * interface lets us contract-test serialization and key behavior without live
 * credentials or testnet writes.
 */
export type OgObjectClient = {
  /**
   * Describes which storage guarantees the client can provide.
   *
   * Agent runtimes can use these flags to distinguish a durable KV backend
   * from a same-process demo backend before they rely on persisted state after
   * a restart.
   */
  readonly capabilities?: readonly OgObjectCapability[];
  /** Reads a UTF-8 object by key, or returns undefined when the object is absent. */
  readonly getObject: (key: string) => Promise<string | undefined>;
  /** Writes a UTF-8 object and returns an optional backend-specific reference. */
  readonly putObject: (key: string, value: string) => Promise<OgPutObjectResult>;
};

/**
 * Storage guarantees exposed by an object client.
 *
 * These are intentionally about behavior the SDK can rely on, not the backend
 * brand. For example, file storage and KV can both write objects, but only KV
 * gives durable lookup by logical key after the process restarts.
 */
export type OgObjectCapability =
  | 'object-write'
  | 'object-read'
  | 'same-process-key-read'
  | 'durable-key-read'
  | 'immutable-object-reference'
  | 'audit-append';

/** Backend-specific write reference returned after persisting an object. */
export type OgPutObjectResult = {
  readonly reference?: string;
};

/**
 * Checks whether an object client exposes a specific storage guarantee.
 *
 * Use this before relying on backend behavior that not every 0G-compatible
 * client can provide, such as durable lookup by logical key after restart.
 */
export function hasOgObjectCapability(client: OgObjectClient, capability: OgObjectCapability): boolean {
  return client.capabilities?.includes(capability) ?? false;
}

/**
 * Checks whether a storage client is suitable for long-lived agent state.
 *
 * Durable agent state needs logical-key reads that survive process restarts.
 * File-backed clients without an external manifest intentionally return false
 * here even though they can write and read objects during the same runtime.
 */
export function supportsDurableOgState(client: OgObjectClient): boolean {
  return hasOgObjectCapability(client, 'durable-key-read');
}

/** Options for the 0G storage adapter. */
export type OgStorageOptions = {
  /** Logical namespace or bucket/prefix for this app's agent records. */
  readonly namespace?: string;
  /** Object client backed by 0G Storage, 0G KV, or a test double. */
  readonly client?: OgObjectClient;
};

const NOT_IMPLEMENTED_REASON =
  'The real 0G storage adapter needs an OgObjectClient. Use localOgStorage() from @0xagentio/sdk for local tests, or pass a client that wraps the 0G SDK.';

/**
 * Creates a 0G-backed storage adapter for agent state and audit events.
 *
 * The SDK runtime consumes only the generic StorageAdapter interface, so this is
 * the drop-in replacement for localOgStorage(). For now the actual 0G network
 * calls are supplied through `OgObjectClient`, which can be backed by memory,
 * 0G KV, or another 0G-compatible object store.
 */
export function ogStorage(options: OgStorageOptions = {}): StorageAdapter {
  if (options.client === undefined) {
    return new MissingOgClientStorageAdapter();
  }

  return new OgStorageAdapter(options.client, options.namespace);
}

class OgStorageAdapter implements StorageAdapter {
  constructor(
    private readonly client: OgObjectClient,
    private readonly namespace: string | undefined,
  ) {}

  async loadState(identity: AgentIdentity): Promise<AgentState> {
    const key = this.key(agentStateKey(identity.id));
    const document = await this.client.getObject(key);
    if (document === undefined) {
      throw new Error(`No state found for agent ${identity.id}.`);
    }

    return decodeAgentStateDocument(document);
  }

  async saveState(identity: AgentIdentity, state: AgentState): Promise<void> {
    await this.client.putObject(this.key(agentStateKey(identity.id)), encodeAgentStateDocument(identity.id, state));
  }

  async appendAuditEvent(event: AuditEvent): Promise<void> {
    await this.client.putObject(this.key(auditEventKey(event.agentId, event.id)), encodeAuditEventDocument(event));
  }

  private key(key: string): string {
    return namespacedKey(this.namespace, key);
  }
}

class MissingOgClientStorageAdapter implements StorageAdapter {
  async loadState(_identity: AgentIdentity): Promise<AgentState> {
    throw new Error(NOT_IMPLEMENTED_REASON);
  }

  async saveState(_identity: AgentIdentity, _state: AgentState): Promise<void> {
    throw new Error(NOT_IMPLEMENTED_REASON);
  }

  async appendAuditEvent(_event: AuditEvent): Promise<void> {
    throw new Error(NOT_IMPLEMENTED_REASON);
  }
}

export type { OgStorageDocument } from './codec.js';
export { decodeAgentStateDocument, encodeAgentStateDocument, encodeAuditEventDocument } from './codec.js';
export { agentStateKey, auditEventKey, namespacedKey } from './keys.js';
export { memoryOgObjectClient, type MemoryOgObjectClient, type MemoryOgObjectEntry } from './memory-client.js';
export {
  ogFileObjectClient,
  ogKvObjectClient,
  type OgFileObjectClientOptions,
  type OgKvObjectClientOptions,
} from './network-client.js';
