import type {
  AgentIdentity,
  AgentMessage,
  AgentState,
  Credential,
  DelegationVerifier,
  ExecutionAdapter,
  PeerId,
  Policy,
  ProofAdapter,
  ReasoningEngine,
  StorageAdapter,
  TransportAdapter,
} from '@0xagentio/core';

import {
  createTrustedAgent,
  type AgentStepResult,
  type TrustedAgent,
} from './create-trusted-agent.js';
import {
  createAgentPeer,
  type AgentPeer,
  type AgentPeerRequestOptions,
} from './peer-agent.js';

/**
 * Dependencies for creating a full agent runtime.
 *
 * Use this when an application wants one object that combines the agent's
 * decision loop with optional peer communication. The individual adapters stay
 * pluggable, so the same runtime can run locally or with real backends such as
 * Noir proofs, 0G storage, and AXL transport.
 */
export type CreateAgentRuntimeOptions = {
  /** Identity of the running agent. */
  readonly identity: AgentIdentity;
  /** Credential binding the agent to delegated authority. */
  readonly credential: Credential;
  /** Policy constraining the agent's decisions and proof requests. */
  readonly policy: Policy;
  /** Initial state saved when the storage backend has no prior state. */
  readonly initialState: AgentState;
  /** Decision layer that proposes the next action. */
  readonly reasoning: ReasoningEngine;
  /** Proof backend that proves and verifies authorized actions. */
  readonly proof: ProofAdapter;
  /** Persistence backend for state and audit events. */
  readonly storage: StorageAdapter;
  /** Optional transport for peer-to-peer agent messages. */
  readonly transport?: TransportAdapter;
  /** Optional backend for executing authorized actions after proof generation. */
  readonly execution?: ExecutionAdapter;
  /** Optional verifier for principal delegation signatures on credentials. */
  readonly delegationVerifier?: DelegationVerifier;
  /** Optional clock for deterministic examples and tests. */
  readonly now?: () => Date;
  /** Optional event id generator for deterministic examples and tests. */
  readonly createEventId?: () => string;
};

/**
 * Agent runtime composed from the SDK's pluggable backend adapters.
 *
 * Developers use this as the high-level surface for an agent that can decide,
 * prove, persist state, and optionally communicate with other agents. Lower
 * level helpers remain available when an application needs finer control.
 */
export type AgentRuntime = {
  /** Identity associated with this runtime. */
  readonly identity: AgentIdentity;
  /** Runs one reasoning, validation, proof, execution, and audit cycle. */
  startOnce(): Promise<AgentStepResult>;
  /** Loads this agent's latest state from the configured storage backend. */
  loadState(): Promise<AgentState>;
  /** Saves this agent's latest state to the configured storage backend. */
  saveState(state: AgentState): Promise<void>;
  /** Sends a message through the configured transport. */
  send(peerId: PeerId, message: AgentMessage): Promise<void>;
  /** Sends a message and waits for a correlated reply through the configured transport. */
  request(
    peerId: PeerId,
    message: AgentMessage,
    options?: AgentPeerRequestOptions,
  ): Promise<AgentMessage>;
  /** Registers this runtime as a listener for raw incoming peer messages. */
  onMessage(
    handler: Parameters<AgentPeer['onMessage']>[0],
  ): Promise<void> | void;
  /** Returns the lower-level trusted decision agent when direct access is needed. */
  trustedAgent(): TrustedAgent;
  /** Returns the lower-level peer helper, or undefined when no transport was configured. */
  peer(): AgentPeer | undefined;
};

/**
 * Creates a composed agent runtime from proof, storage, reasoning, and transport adapters.
 */
export function createAgentRuntime(
  options: CreateAgentRuntimeOptions,
): AgentRuntime {
  const trusted = createTrustedAgent({
    identity: options.identity,
    credential: options.credential,
    policy: options.policy,
    initialState: options.initialState,
    reasoning: options.reasoning,
    proof: options.proof,
    storage: options.storage,
    execution: options.execution,
    delegationVerifier: options.delegationVerifier,
    now: options.now,
    createEventId: options.createEventId,
  });
  const peer =
    options.transport === undefined
      ? undefined
      : createAgentPeer({
          identity: options.identity,
          transport: options.transport,
        });

  return {
    identity: options.identity,

    startOnce() {
      return trusted.startOnce();
    },

    loadState() {
      return options.storage.loadState(options.identity);
    },

    saveState(state) {
      return options.storage.saveState(options.identity, state);
    },

    async send(peerId, message) {
      const activePeer = requirePeer(peer);
      await activePeer.send(peerId, message);
    },

    async request(peerId, message, requestOptions) {
      const activePeer = requirePeer(peer);
      return activePeer.request(peerId, message, requestOptions);
    },

    onMessage(handler) {
      return requirePeer(peer).onMessage(handler);
    },

    trustedAgent() {
      return trusted;
    },

    peer() {
      return peer;
    },
  };
}

function requirePeer(peer: AgentPeer | undefined): AgentPeer {
  if (peer === undefined) {
    throw new Error('Agent runtime was created without a transport adapter.');
  }

  return peer;
}
