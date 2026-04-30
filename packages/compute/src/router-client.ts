import type {
  LlmClient,
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmMessage,
} from '@0xagentio/sdk';

/** Mainnet 0G Compute Router OpenAI-compatible base URL. */
export const ZERO_G_COMPUTE_ROUTER_MAINNET_BASE_URL =
  'https://router-api.0g.ai/v1';

/** Testnet 0G Compute Router OpenAI-compatible base URL. */
export const ZERO_G_COMPUTE_ROUTER_TESTNET_BASE_URL =
  'https://router-api-testnet.integratenetwork.work/v1';

/** Strategy used to request JSON model output from OpenAI-compatible providers. */
export type ZeroGComputeRouterResponseFormatStrategy =
  | 'openai-json-object'
  | 'prompt-only';

/** Minimal fetch shape used by the 0G Compute Router client. */
export type ZeroGComputeRouterFetch = (
  input: string,
  init: {
    readonly method: 'POST';
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
  },
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

/** Options for the 0G Compute Router LLM client. */
export type ZeroGComputeRouterLlmClientOptions = {
  /** Router API key created in the 0G portal. */
  readonly apiKey: string;
  /** Model id from the live 0G Router model catalog. */
  readonly model: string;
  /** Router base URL. Defaults to the 0G testnet Router endpoint. */
  readonly baseUrl?: string;
  /** Optional fetch implementation for tests or custom runtimes. */
  readonly fetch?: ZeroGComputeRouterFetch;
  /** Optional extra headers, for example app-level tracing headers. */
  readonly headers?: Readonly<Record<string, string>>;
  /** How JSON responses should be requested. Defaults to OpenAI JSON object mode. */
  readonly responseFormatStrategy?: ZeroGComputeRouterResponseFormatStrategy;
};

/**
 * Creates an LLM client backed by the 0G Compute Router.
 *
 * The Router exposes an OpenAI-compatible `/chat/completions` API, so this
 * adapter converts AgentIO's provider-neutral `LlmCompletionRequest` into that
 * request shape and normalizes the response back into `LlmCompletionResult`.
 */
export function zeroGComputeRouterLlmClient(
  options: ZeroGComputeRouterLlmClientOptions,
): LlmClient {
  const baseUrl = normalizeBaseUrl(
    options.baseUrl ?? ZERO_G_COMPUTE_ROUTER_TESTNET_BASE_URL,
  );
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (fetchImpl === undefined) {
    throw new Error('A fetch implementation is required for 0G Compute Router.');
  }

  return {
    async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
      const body = createChatCompletionBody(request, options);
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
          ...options.headers,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(
          `0G Compute Router request failed with ${response.status} ${response.statusText}: ${await response.text()}`,
        );
      }

      return parseChatCompletionResponse(await response.json(), options.model);
    },
  };
}

/**
 * Builds the OpenAI-compatible chat completion body for 0G Compute Router.
 *
 * This helper is exported for tests and for developers who need to inspect the
 * exact request shape before sending live paid inference calls.
 */
export function createZeroGComputeRouterChatCompletionBody(
  request: LlmCompletionRequest,
  options: Pick<
    ZeroGComputeRouterLlmClientOptions,
    'model' | 'responseFormatStrategy'
  >,
): Readonly<Record<string, unknown>> {
  return createChatCompletionBody(request, options);
}

function createChatCompletionBody(
  request: LlmCompletionRequest,
  options: Pick<
    ZeroGComputeRouterLlmClientOptions,
    'model' | 'responseFormatStrategy'
  >,
): Readonly<Record<string, unknown>> {
  const messages = [
    ...(request.system === undefined
      ? []
      : [{ role: 'system' as const, content: request.system }]),
    ...request.messages,
  ];
  const body: Record<string, unknown> = {
    model: options.model,
    messages: messages.map(normalizeMessage),
  };

  if (
    request.responseFormat === 'json' &&
    options.responseFormatStrategy !== 'prompt-only'
  ) {
    body.response_format = { type: 'json_object' };
  }

  return body;
}

function normalizeMessage(message: LlmMessage): Readonly<Record<string, string>> {
  return {
    role: message.role,
    content: message.content,
  };
}

function parseChatCompletionResponse(
  value: unknown,
  fallbackModel: string,
): LlmCompletionResult {
  if (!isRecord(value)) {
    throw new Error('0G Compute Router response must be a JSON object.');
  }

  const choices = value.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('0G Compute Router response did not include choices.');
  }

  const firstChoice = choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw new Error('0G Compute Router response choice did not include a message.');
  }

  const content = firstChoice.message.content;
  if (typeof content !== 'string') {
    throw new Error('0G Compute Router response message content must be a string.');
  }

  return {
    content,
    model: typeof value.model === 'string' ? value.model : fallbackModel,
    metadata: {
      id: typeof value.id === 'string' ? value.id : undefined,
      usage: isRecord(value.usage) ? value.usage : undefined,
    },
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
