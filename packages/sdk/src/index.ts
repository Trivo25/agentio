export {
  createTrustedAgent,
  type AgentStepResult,
  type CreateTrustedAgentOptions,
  type TrustedAgent,
} from './create-trusted-agent.js';
export { localMemoryStorage, type LocalMemoryStorage } from './local-memory-storage.js';
export { localPolicyProofs } from './local-policy-proof.js';
export { staticReasoningEngine } from './static-reasoning-engine.js';
export { localTransport, type LocalTransport } from './local-transport.js';
export {
  onVerifiedMessage,
  verifyCredentialMessage,
  type VerifiedMessageHandlers,
  type VerifiedMessageResult,
} from './verified-message.js';
