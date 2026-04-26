export {
  createTrustedAgent,
  type AgentStepResult,
  type CreateTrustedAgentOptions,
  type TrustedAgent,
} from './create-trusted-agent.js';
export { localMemoryStorage, type LocalMemoryStorage } from './local-memory-storage.js';
export { localOgStorage, type LocalOgStorage, type LocalOgStorageRecord } from './local-og-storage.js';
export { localNoirProofs } from './local-noir-proof.js';
export { localPolicyProofs } from './local-policy-proof.js';
export { staticReasoningEngine } from './static-reasoning-engine.js';
export { localAxlTransport, type LocalAxlEnvelope, type LocalAxlTransport } from './local-axl-transport.js';
export { localTransport, type LocalTransport } from './local-transport.js';
export {
  onVerifiedMessage,
  verifyCredentialMessage,
  type VerifiedMessageHandlers,
  type VerifiedMessageResult,
} from './verified-message.js';
export { localExecution } from './local-execution.js';
export { createActionIntent } from './action.js';
export { issueLocalCredential, type IssueLocalCredentialOptions } from './local-credential.js';
export { createPolicy } from './policy.js';
export { createAgentIdentity } from './identity.js';
export { POLICY_HASH_ALGORITHM, createNoirAuthorizationInput, hashPolicy, serializePolicy } from '@0xagentio/core';
export type { DelegationSigner, DelegationVerificationResult, DelegationVerifier } from '@0xagentio/core';
export type {
  NoirAuthorizationInput,
  NoirAuthorizationPrivateInputs,
  NoirAuthorizationPublicInputs,
  NoirMetadataValue,
} from '@0xagentio/core';
export {
  localDelegationSigner,
  verifyLocalDelegation,
  type LocalDelegationVerificationResult,
} from './local-delegation.js';
