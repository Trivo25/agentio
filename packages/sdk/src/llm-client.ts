/** Role used for a provider-neutral LLM chat message. */
export type LlmMessageRole = 'system' | 'user' | 'assistant';

/**
 * Provider-neutral message passed to an LLM client.
 *
 * The SDK keeps this shape small so the same reasoning engine can run on 0G
 * Compute, hosted model APIs, or local models without changing agent runtime
 * code.
 */
export type LlmMessage = {
  /** Speaker role understood by chat-style model providers. */
  readonly role: LlmMessageRole;
  /** Text content sent to the model. */
  readonly content: string;
};

/**
 * Provider-neutral completion request.
 *
 * Reasoning engines use this contract to ask a model for a structured decision
 * while provider adapters translate it to their own HTTP or SDK request format.
 */
export type LlmCompletionRequest = {
  /** Optional high-level instruction for providers that separate system prompts. */
  readonly system?: string;
  /** Ordered conversation messages. */
  readonly messages: readonly LlmMessage[];
  /** Optional response mode. `json` means callers expect machine-readable JSON. */
  readonly responseFormat?: 'json';
};

/**
 * Provider-neutral completion response.
 *
 * `content` is intentionally plain text because provider adapters can normalize
 * many response formats into one string before the reasoning engine parses it.
 */
export type LlmCompletionResult = {
  /** Raw model response content. */
  readonly content: string;
  /** Provider/model identifier when available for logs and debugging. */
  readonly model?: string;
  /** Provider-specific metadata that applications may inspect but should not rely on. */
  readonly metadata?: Readonly<Record<string, unknown>>;
};

/**
 * Minimal interface implemented by LLM providers.
 *
 * This is the seam that lets AgentIO treat 0G Compute as a first-class provider
 * while still allowing OpenAI, Anthropic, local models, and test doubles to use
 * the same reasoning engine.
 */
export type LlmClient = {
  /** Sends a completion request and returns normalized text content. */
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResult>;
};

/**
 * Creates an LLM client from a function.
 *
 * This helper is useful for tests, examples, and lightweight integrations where
 * a developer wants to adapt an existing model call without creating a class.
 */
export function createLlmClient(
  complete: (request: LlmCompletionRequest) => Promise<LlmCompletionResult>,
): LlmClient {
  return { complete };
}

/**
 * Creates a deterministic LLM client for tests and local examples.
 *
 * The mock still receives the full prompt request, so examples can verify the
 * reasoning engine sends useful context without making network calls.
 */
export function mockLlmClient(
  complete: (request: LlmCompletionRequest) => string | LlmCompletionResult | Promise<string | LlmCompletionResult>,
): LlmClient {
  return createLlmClient(async (request) => {
    const result = await complete(request);
    return typeof result === 'string' ? { content: result, model: 'mock' } : result;
  });
}
