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
  /** Reads a UTF-8 object by key, or returns undefined when the object is absent. */
  readonly getObject: (key: string) => Promise<string | undefined>;
  /** Writes a UTF-8 object and returns an optional backend-specific reference. */
  readonly putObject: (key: string, value: string) => Promise<OgPutObjectResult>;
};

/** Backend-specific write reference returned after persisting an object. */
export type OgPutObjectResult = {
  readonly reference?: string;
};

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
 * calls are supplied through `OgObjectClient`; the next increment will wrap the
 * official `@0glabs/0g-ts-sdk` APIs behind that client.
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
