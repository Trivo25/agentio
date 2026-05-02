import type { LiveQuoteOptions } from './config.js';
import { logDetail } from './logging.js';

export type UniswapCheckApprovalRequestBody = {
  readonly walletAddress: string;
  readonly token: string;
  readonly amount: string;
  readonly chainId: number;
  readonly tokenOut?: string;
  readonly tokenOutChainId?: number;
  readonly includeGasInfo?: boolean;
};

export type UniswapQuoteRequestBody = {
  readonly type: 'EXACT_INPUT';
  readonly amount: string;
  readonly tokenInChainId: number;
  readonly tokenOutChainId: number;
  readonly tokenIn: string;
  readonly tokenOut: string;
  readonly swapper: string;
  readonly slippageTolerance: number;
  readonly routingPreference: 'BEST_PRICE' | 'FASTEST';
  readonly protocols?: readonly ('V2' | 'V3' | 'V4' | 'UNISWAPX_V2' | 'UNISWAPX_V3')[];
};

export type UniswapSwapRequestBody = {
  readonly quote: unknown;
  readonly signature?: string;
  readonly permitData?: unknown;
  readonly includeGasInfo?: boolean;
  readonly refreshGasPrice?: boolean;
  readonly simulateTransaction?: boolean;
  readonly safetyMode?: 'SAFE';
  readonly deadline?: number;
};

export type UniswapOrderRequestBody = {
  readonly quote: unknown;
  readonly signature: string;
  readonly routing?: string;
};

export type PreparedApprovalRequest = {
  readonly method: 'POST';
  readonly headers: Record<string, string>;
  readonly body: UniswapCheckApprovalRequestBody;
};

export type PreparedQuoteRequest = {
  readonly method: 'POST';
  readonly headers: Record<string, string>;
  readonly body: UniswapQuoteRequestBody;
};

export type PreparedSwapRequest = {
  readonly method: 'POST';
  readonly headers: Record<string, string>;
  readonly body: UniswapSwapRequestBody;
};

export type PreparedOrderRequest = {
  readonly method: 'POST';
  readonly headers: Record<string, string>;
  readonly body: UniswapOrderRequestBody;
};

export type UniswapApprovalSummary = {
  readonly hasApprovalTransaction: boolean;
  readonly hasCancelTransaction: boolean;
  readonly hasGasInfo: boolean;
};

export type UniswapQuoteSummary = {
  readonly requestId?: string;
  readonly routing?: string;
  readonly hasPermitData?: boolean;
  readonly hasPermitTransaction?: boolean;
};

export type UniswapQuoteResult = {
  readonly summary: UniswapQuoteSummary;
  readonly quoteForSwap: unknown;
  readonly permitData?: unknown;
};

export type UniswapSwapSummary = {
  readonly requestId?: string;
  readonly hasSwapTransaction: boolean;
  readonly transactionValid: boolean;
};

export type UniswapOrderSummary = {
  readonly requestId?: string;
  readonly orderId?: string;
  readonly orderStatus?: string;
  readonly hasSignature: boolean;
};

export type UniswapExecutionEndpoint = 'order' | 'swap' | 'unsupported';

export type UniswapGateway = {
  readonly checkApproval: (body: UniswapCheckApprovalRequestBody) => Promise<{
    readonly endpoint: string;
    readonly request: PreparedApprovalRequest;
    readonly networkCall: string;
    readonly summary?: UniswapApprovalSummary;
  }>;
  readonly quote: (body: UniswapQuoteRequestBody) => Promise<{
    readonly endpoint: string;
    readonly request: PreparedQuoteRequest;
    readonly networkCall: string;
    readonly result?: UniswapQuoteResult;
  }>;
  readonly prepareSwap: (quote: unknown, permitData: unknown) => Promise<{
    readonly endpoint: string;
    readonly request: PreparedSwapRequest;
    readonly networkCall: string;
    readonly summary: UniswapSwapSummary;
  }>;
  readonly prepareOrder: (quote: Record<string, unknown>) => Promise<{
    readonly endpoint: string;
    readonly request: PreparedOrderRequest;
    readonly networkCall: string;
    readonly summary: UniswapOrderSummary;
  }>;
};

/**
 * Creates a small Uniswap API gateway for the example.
 *
 * Bob calls this after AgentIO proof verification so API work, calldata
 * preparation, and live order submission are tied to delegated authority.
 */
export function createUniswapGateway(
  options: LiveQuoteOptions,
  now: Date,
): UniswapGateway {
  return {
    async checkApproval(body) {
      const endpoint = `${trimTrailingSlash(options.baseUrl)}/check_approval`;
      const request = createPreparedApprovalRequest(options, body);
      const summary = options.runNetworkRequest
        ? await requestUniswapApproval(endpoint, request, options)
        : undefined;

      return {
        endpoint,
        request,
        networkCall: options.runNetworkRequest ? 'submitted POST /check_approval' : 'disabled by default',
        summary,
      };
    },
    async quote(body) {
      const endpoint = `${trimTrailingSlash(options.baseUrl)}/quote`;
      const request = createPreparedQuoteRequest(options, body);
      const result = options.runNetworkRequest
        ? await requestUniswapQuote(endpoint, request, options)
        : undefined;

      return {
        endpoint,
        request,
        networkCall: options.runNetworkRequest ? 'submitted POST /quote' : 'disabled by default',
        result,
      };
    },
    async prepareSwap(quote, permitData) {
      const endpoint = `${trimTrailingSlash(options.baseUrl)}/swap`;
      const request = createPreparedSwapRequest(options, quote, permitData, now);
      const liveSummary = options.runSwapNetworkRequest
        ? await requestUniswapSwap(endpoint, request, options)
        : undefined;

      return {
        endpoint,
        request,
        networkCall: options.runSwapNetworkRequest ? 'submitted POST /swap' : 'disabled by default',
        summary: liveSummary ?? validatePreparedSwapRequest(request),
      };
    },
    async prepareOrder(quote) {
      const endpointName = routeToExecutionEndpoint(readString(quote.routing));
      if (endpointName !== 'order') {
        throw new Error(`Bob expected a UniswapX order route but received ${endpointName}.`);
      }

      const endpoint = `${trimTrailingSlash(options.baseUrl)}/order`;
      const request = createPreparedOrderRequest(options, quote);
      const liveSummary = options.runOrderNetworkRequest
        ? await requestUniswapOrder(endpoint, request, options)
        : undefined;

      return {
        endpoint,
        request,
        networkCall: options.runOrderNetworkRequest ? 'submitted POST /order' : 'disabled by default',
        summary: liveSummary ?? validatePreparedOrderRequest(request),
      };
    },
  };
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function createPreparedApprovalRequest(
  options: LiveQuoteOptions,
  body: UniswapCheckApprovalRequestBody,
): PreparedApprovalRequest {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-api-key': options.apiKey ?? '<missing>',
      'x-permit2-disabled': String(options.permit2Disabled),
    },
    body,
  };
}

function createPreparedQuoteRequest(
  options: LiveQuoteOptions,
  body: UniswapQuoteRequestBody,
): PreparedQuoteRequest {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-api-key': options.apiKey ?? '<missing>',
      'x-universal-router-version': options.universalRouterVersion,
      'x-erc20eth-enabled': String(options.erc20EthEnabled),
      'x-permit2-disabled': String(options.permit2Disabled),
    },
    body,
  };
}

function createPreparedSwapRequest(
  options: LiveQuoteOptions,
  quote: unknown,
  permitData: unknown,
  now: Date,
): PreparedSwapRequest {
  const signature = permitData === undefined || permitData === null
    ? undefined
    : options.permitSignature;
  if (options.runSwapNetworkRequest && permitData !== undefined && permitData !== null && signature === undefined) {
    throw new Error('AGENTIO_UNISWAP_PERMIT_SIGNATURE is required to submit /swap when quote permitData is present.');
  }

  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-api-key': options.apiKey ?? '<missing>',
      'x-universal-router-version': options.universalRouterVersion,
      'x-permit2-disabled': String(options.permit2Disabled),
    },
    body: {
      quote,
      ...(signature === undefined ? {} : { signature }),
      ...(signature === undefined ? {} : { permitData }),
      refreshGasPrice: true,
      simulateTransaction: false,
      safetyMode: 'SAFE',
      deadline: Math.floor(now.getTime() / 1_000) + 300,
    },
  };
}

function createPreparedOrderRequest(
  options: LiveQuoteOptions,
  quote: Record<string, unknown>,
): PreparedOrderRequest {
  if (options.runOrderNetworkRequest && options.orderSignature === undefined) {
    throw new Error('AGENTIO_UNISWAP_ORDER_SIGNATURE is required to submit /order.');
  }

  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-api-key': options.apiKey ?? '<missing>',
      'x-erc20eth-enabled': String(options.erc20EthEnabled),
    },
    body: {
      quote,
      signature: options.orderSignature ?? '<signature-required>',
      routing: readString(quote.routing),
    },
  };
}

/**
 * Calls the Uniswap approval endpoint after the caller has verified authority.
 *
 * The response can include approval or cancel calldata, so applications should
 * still require wallet review before anything is signed.
 */
async function requestUniswapApproval(
  endpoint: string,
  request: PreparedApprovalRequest,
  options: LiveQuoteOptions,
): Promise<UniswapApprovalSummary> {
  assertApiKey(options);

  logDetail('Live approval check', 'submitting POST /check_approval');
  const response = await fetchJson(endpoint, request);
  return summarizeApprovalResponse(response, '/check_approval');
}

/**
 * Calls the Uniswap quote endpoint after the caller has verified authority.
 *
 * The returned quote decides whether the next execution path is classic swap
 * calldata or a signed UniswapX order.
 */
async function requestUniswapQuote(
  endpoint: string,
  request: PreparedQuoteRequest,
  options: LiveQuoteOptions,
): Promise<UniswapQuoteResult> {
  assertApiKey(options);

  logDetail('Live quote', 'submitting POST /quote');
  const response = await fetchJson(endpoint, request);
  return {
    summary: summarizeQuoteResponse(response),
    quoteForSwap: extractQuoteForSwap(response),
    permitData: isRecord(response) ? response.permitData : undefined,
  };
}

/**
 * Calls the Uniswap swap endpoint after the caller has verified authority.
 *
 * The response is still only unsigned calldata. Applications must validate it,
 * collect a wallet signature, and broadcast through their own RPC path.
 */
async function requestUniswapSwap(
  endpoint: string,
  request: PreparedSwapRequest,
  options: LiveQuoteOptions,
): Promise<UniswapSwapSummary> {
  assertApiKey(options);

  logDetail('Live swap preparation', 'submitting POST /swap');
  const response = await fetchJson(endpoint, request);
  return summarizeSwapResponse(response);
}

/**
 * Calls the UniswapX order endpoint after the caller has verified authority.
 *
 * A signed order can become fillable once accepted, so the example keeps this
 * behind an explicit live-order flag.
 */
async function requestUniswapOrder(
  endpoint: string,
  request: PreparedOrderRequest,
  options: LiveQuoteOptions,
): Promise<UniswapOrderSummary> {
  assertApiKey(options);

  logDetail('Live order preparation', 'submitting POST /order');
  const response = await fetchJson(endpoint, request);
  return summarizeOrderResponse(response, request);
}

async function fetchJson(
  endpoint: string,
  request: PreparedApprovalRequest | PreparedQuoteRequest | PreparedSwapRequest | PreparedOrderRequest,
): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body),
  });
  const responseText = await response.text();
  const responseBody = parseJsonResponse(responseText);

  if (!response.ok) {
    throw new Error(
      `Uniswap ${endpoint} failed with ${response.status} ${response.statusText}: ${responseText}`,
    );
  }

  return responseBody;
}

function assertApiKey(options: LiveQuoteOptions): void {
  if (options.apiKey === undefined) {
    throw new Error('AGENTIO_UNISWAP_API_KEY is required when live Uniswap API calls are enabled.');
  }
}

function parseJsonResponse(text: string): unknown {
  if (text.trim() === '') {
    return undefined;
  }

  return JSON.parse(text) as unknown;
}

function summarizeQuoteResponse(response: unknown): UniswapQuoteSummary {
  if (!isRecord(response)) {
    throw new Error('Uniswap /quote response was not a JSON object.');
  }

  const requestId = readString(response.requestId);
  const routing = readString(response.routing);

  return {
    requestId,
    routing,
    hasPermitData: response.permitData !== null && response.permitData !== undefined,
    hasPermitTransaction: response.permitTransaction !== null && response.permitTransaction !== undefined,
  };
}

function summarizeApprovalResponse(
  response: unknown,
  endpointName: string,
): UniswapApprovalSummary {
  if (!isRecord(response)) {
    throw new Error(`Uniswap ${endpointName} response was not a JSON object.`);
  }

  return {
    hasApprovalTransaction: response.approval !== null && response.approval !== undefined,
    hasCancelTransaction: response.cancel !== null && response.cancel !== undefined,
    hasGasInfo: response.gasFee !== null && response.gasFee !== undefined,
  };
}

function summarizeSwapResponse(response: unknown): UniswapSwapSummary {
  if (!isRecord(response)) {
    throw new Error('Uniswap /swap response was not a JSON object.');
  }

  const requestId = readString(response.requestId);
  const swap = response.swap;
  const transactionValid = validateTransactionRequest(swap);

  if (!transactionValid) {
    throw new Error('Uniswap /swap response did not include valid transaction calldata.');
  }

  return {
    requestId,
    hasSwapTransaction: true,
    transactionValid,
  };
}

function summarizeOrderResponse(
  response: unknown,
  request: PreparedOrderRequest,
): UniswapOrderSummary {
  if (!isRecord(response)) {
    throw new Error('Uniswap /order response was not a JSON object.');
  }

  return {
    requestId: readString(response.requestId),
    orderId: readString(response.orderId),
    orderStatus: readString(response.orderStatus),
    hasSignature: hasRealSignature(request.body.signature),
  };
}

function validatePreparedSwapRequest(request: PreparedSwapRequest): UniswapSwapSummary {
  return {
    hasSwapTransaction: false,
    transactionValid: isRecord(request.body.quote),
  };
}

function validatePreparedOrderRequest(request: PreparedOrderRequest): UniswapOrderSummary {
  return {
    hasSignature: hasRealSignature(request.body.signature),
  };
}

function validateTransactionRequest(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return isNonEmptyHex(readString(value.data)) &&
    isAddressLike(readString(value.to)) &&
    isAddressLike(readString(value.from));
}

function extractQuoteForSwap(response: unknown): unknown {
  if (!isRecord(response)) {
    throw new Error('Uniswap /quote response was not a JSON object.');
  }

  return response.quote ?? response;
}

function routeToExecutionEndpoint(routing: string | undefined): UniswapExecutionEndpoint {
  if (routing === 'CLASSIC' || routing === 'WRAP' || routing === 'UNWRAP' || routing === 'BRIDGE') {
    return 'swap';
  }

  if (routing === 'DUTCH_V2' || routing === 'DUTCH_V3' || routing === 'LIMIT_ORDER' || routing === 'PRIORITY') {
    return 'order';
  }

  return 'unsupported';
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, '');
}

function isNonEmptyHex(value: string | undefined): boolean {
  return value !== undefined && /^0x[0-9a-fA-F]+$/.test(value) && value !== '0x';
}

function isAddressLike(value: string | undefined): boolean {
  return value !== undefined && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function hasRealSignature(value: string): boolean {
  return value !== '<signature-required>' && isNonEmptyHex(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
