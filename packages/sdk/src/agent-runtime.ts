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
 * Dependencies for creating the recommended high-level agent runtime.
 *
 * Use this when an application wants one object that can decide, prove, execute,
 * persist state, and communicate with other agents. Each capability is supplied
 * as an adapter, so the same application code can start locally and later swap
 * in real Noir, 0G, Gensyn AXL, or domain-specific execution backends.
 */
export type CreateAgentRuntimeOptions = {
  /** Identity that names this agent in proofs, state records, and peer messages. */
  readonly identity: AgentIdentity;
  /** Credential showing which principal authority this agent is allowed to use. */
  readonly credential: Credential;
  /** Policy that every runtime decision must satisfy before proof or execution. */
  readonly policy: Policy;
  /** Initial mutable state used for the first run before persisted state exists. */
  readonly initialState: AgentState;
  /** Reasoning layer that proposes the next action or chooses to skip. */
  readonly reasoning: ReasoningEngine;
  /** Proof backend used to bind an approved action to this credential and policy. */
  readonly proof: ProofAdapter;
  /** Storage backend used to remember agent state and audit what happened. */
  readonly storage: StorageAdapter;
  /** Optional transport that lets this runtime send, request, and listen for peer messages. */
  readonly transport?: TransportAdapter;
  /** Optional executor that consumes a proved action and returns a domain receipt. */
  readonly execution?: ExecutionAdapter;
  /** Optional verifier that rejects credentials not signed by the delegating principal. */
  readonly delegationVerifier?: DelegationVerifier;
  /** Optional clock for deterministic examples, tests, and replayable runs. */
  readonly now?: () => Date;
  /** Optional event id generator for deterministic audit records. */
  readonly createEventId?: () => string;
};

/**
 * High-level agent object composed from the SDK's pluggable adapters.
 *
 * Developers use this as the primary application surface when an agent should
 * own both its decision loop and its communication boundary. Lower-level helpers
 * remain available for applications that need to orchestrate those pieces
 * separately.
 */
export type AgentRuntime = {
  /** Identity this runtime uses for decisions, state, proofs, and messages. */
  readonly identity: AgentIdentity;
  /** Runs one full agent cycle: load state, reason, validate, prove, execute, persist, and audit. */
  startOnce(): Promise<AgentStepResult>;
  /** Loads the latest persisted state so applications can inspect runtime progress. */
  loadState(): Promise<AgentState>;
  /** Saves state explicitly when an application updates agent state outside `startOnce`. */
  saveState(state: AgentState): Promise<void>;
  /** Sends a peer message from this runtime's identity through the configured transport. */
  send(peerId: PeerId, message: AgentMessage): Promise<void>;
  /** Sends a peer request and waits for the first reply matching its correlation metadata. */
  request(
    peerId: PeerId,
    message: AgentMessage,
    options?: AgentPeerRequestOptions,
  ): Promise<AgentMessage>;
  /** Registers this runtime as the listener for incoming raw peer messages. */
  onMessage(
    handler: Parameters<AgentPeer['onMessage']>[0],
  ): Promise<void> | void;
  /** Returns the lower-level decision/proof agent when an application needs direct control. */
  trustedAgent(): TrustedAgent;
  /** Returns the lower-level peer helper, or undefined when this runtime is non-networked. */
  peer(): AgentPeer | undefined;
};

/**
 * Creates the recommended high-level runtime for a pluggable AgentIO agent.
 *
 * This is the easiest entry point for applications because it wires the trusted
 * decision loop and optional peer messaging into one agent-scoped object.
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
