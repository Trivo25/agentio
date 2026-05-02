import { existsSync, readFileSync } from 'node:fs';

import {
  createActionIntent,
  createAgentIdentity,
  createAgentPeer,
  createAgentReply,
  createPolicy,
  createProofBackedMessage,
  hashPolicy,
  issueLocalCredential,
  localAxlTransport,
  localDelegationSigner,
  localNoirProofs,
  verifyMessageAction,
  type AgentMessage,
  type CorrelatedAgentMessage,
} from '@0xagentio/sdk';

/**
 * Prepares the proof-gated live Uniswap approval, quote, and swap flow.
 *
 * Bob verifies Alice's AgentIO proof before preparing or submitting Uniswap API
 * requests. The default mode does not call the network, so developers can
 * inspect the authorization boundary before enabling live API requests with
 * credentials.
 */

type UniswapCheckApprovalRequestBody = {
  readonly walletAddress: string;
  readonly token: string;
  readonly amount: string;
  readonly chainId: number;
  readonly tokenOut?: string;
  readonly tokenOutChainId?: number;
  readonly includeGasInfo?: boolean;
};

type UniswapQuoteRequestBody = {
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

type UniswapSwapRequestBody = {
  readonly quote: unknown;
  readonly signature?: string;
  readonly permitData?: unknown;
  readonly includeGasInfo?: boolean;
  readonly refreshGasPrice?: boolean;
  readonly simulateTransaction?: boolean;
  readonly safetyMode?: 'SAFE';
  readonly deadline?: number;
};

type LiveQuoteOptions = {
  readonly apiKey?: string;
  readonly permitSignature?: string;
  readonly baseUrl: string;
  readonly universalRouterVersion: string;
  readonly erc20EthEnabled: boolean;
  readonly permit2Disabled: boolean;
  readonly runNetworkRequest: boolean;
  readonly runSwapNetworkRequest: boolean;
  readonly replyTimeoutMs: number;
};

type PreparedApprovalRequest = {
  readonly method: 'POST';
  readonly headers: Record<string, string>;
  readonly body: UniswapCheckApprovalRequestBody;
};

type PreparedQuoteRequest = {
  readonly method: 'POST';
  readonly headers: Record<string, string>;
  readonly body: UniswapQuoteRequestBody;
};

type PreparedSwapRequest = {
  readonly method: 'POST';
  readonly headers: Record<string, string>;
  readonly body: UniswapSwapRequestBody;
};

type UniswapApprovalSummary = {
  readonly hasApprovalTransaction: boolean;
  readonly hasCancelTransaction: boolean;
  readonly hasGasInfo: boolean;
};

type UniswapQuoteSummary = {
  readonly requestId?: string;
  readonly routing?: string;
  readonly hasPermitData?: boolean;
  readonly hasPermitTransaction?: boolean;
};

type UniswapQuoteResult = {
  readonly summary: UniswapQuoteSummary;
  readonly quoteForSwap: unknown;
  readonly permitData?: unknown;
};

type UniswapSwapSummary = {
  readonly requestId?: string;
  readonly hasSwapTransaction: boolean;
  readonly transactionValid: boolean;
};

const now = new Date('2026-04-30T12:00:00.000Z');
const quoteBody: UniswapQuoteRequestBody = {
  type: 'EXACT_INPUT',
  amount: '1250000000',
  tokenInChainId: 1,
  tokenOutChainId: 1,
  tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  swapper: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  slippageTolerance: 0.5,
  routingPreference: 'BEST_PRICE',
  protocols: ['V2', 'V3', 'V4'],
};
const approvalBody: UniswapCheckApprovalRequestBody = {
  walletAddress: quoteBody.swapper,
  token: quoteBody.tokenIn,
  amount: quoteBody.amount,
  chainId: quoteBody.tokenInChainId,
  tokenOut: quoteBody.tokenOut,
  tokenOutChainId: quoteBody.tokenOutChainId,
  includeGasInfo: true,
};

const options = readOptions();

logTitle('AgentIO Uniswap live approval, quote, and swap preparation');
logStep('1. Create Alice and Bob');
const aliceIdentity = createAgentIdentity({
  id: 'agent-alice-live-uniswap-quote',
  publicKey: 'agent-public-key-alice-live-uniswap-quote',
});
const bobIdentity = createAgentIdentity({
  id: 'agent-bob-uniswap-api-gateway',
  publicKey: 'agent-public-key-bob-uniswap-api-gateway',
});
logDetail('Alice', 'agent that wants Uniswap approval and quote work');
logDetail('Bob', 'gateway that verifies proof before preparing Uniswap API requests');

logStep('2. Delegate approval-check, quote, and swap-preparation authority');
const policy = createPolicy({
  id: 'policy-uniswap-live-approval-and-quote',
  allowedActions: ['uniswap.checkApproval', 'uniswap.quote', 'uniswap.swap.prepare'],
  constraints: [
    {
      type: 'max-amount',
      value: BigInt(quoteBody.amount),
      actionTypes: ['uniswap.checkApproval', 'uniswap.quote', 'uniswap.swap.prepare'],
    },
    {
      type: 'allowed-metadata-value',
      key: 'venue',
      values: ['uniswap-api'],
      actionTypes: ['uniswap.checkApproval', 'uniswap.quote', 'uniswap.swap.prepare'],
    },
    {
      type: 'allowed-metadata-value',
      key: 'assetPair',
      values: ['USDC/WETH'],
      actionTypes: ['uniswap.checkApproval', 'uniswap.quote', 'uniswap.swap.prepare'],
    },
  ],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
});
const policyHash = hashPolicy(policy);
const credential = await issueLocalCredential({
  identity: aliceIdentity,
  policy,
  id: 'credential-alice-live-uniswap-quote',
  issuedAt: now,
  signer: localDelegationSigner('principal-live-uniswap-demo'),
});
logDetail('Allowed actions', 'uniswap.checkApproval, uniswap.quote, uniswap.swap.prepare');
logDetail('Policy commitment', policyHash);

logStep('3. Create local proof and transport adapters');
const proof = localNoirProofs();
const transport = localAxlTransport('agentio/uniswap-live-quote');
const alicePeer = createAgentPeer({ identity: aliceIdentity, transport });
const bobPeer = createAgentPeer({ identity: bobIdentity, transport });
installBobQuoteGateway(options);
logDetail('Proof', 'local Noir-shaped proof tied to each Uniswap action');
logDetail('Transport', 'local AXL-shaped message delivery');

logStep('4. Alice sends proof-backed approval check to Bob');
const approvalRequest = await createProofBackedMessage({
  id: 'uniswap-live-approval-request-1',
  correlationId: 'uniswap-live-quote-session-1',
  type: 'uniswap.checkApproval.request',
  sender: aliceIdentity.id,
  createdAt: now,
  credential,
  policy,
  state: { cumulativeSpend: 0n, updatedAt: now },
  action: createActionIntent({
    type: 'uniswap.checkApproval',
    amount: BigInt(approvalBody.amount),
    metadata: {
      venue: 'uniswap-api',
      assetPair: 'USDC/WETH',
      chainId: approvalBody.chainId,
      tokenIn: approvalBody.token,
      tokenOut: approvalBody.tokenOut,
    },
  }),
  proof,
  now,
  payload: {
    policyHash,
    approval: approvalBody,
  },
});
const pendingApprovalReply = alicePeer.request(bobIdentity.id, approvalRequest, {
  expectedType: 'uniswap.checkApproval.prepared',
  timeoutMs: options.replyTimeoutMs,
});
await alicePeer.send(bobIdentity.id, approvalRequest);
await transport.receive(approvalRequest);
const approvalReply = (await pendingApprovalReply) as CorrelatedAgentMessage;
logDetail('Bob response', String(approvalReply.payload.status));
logDetail('Endpoint', String(approvalReply.payload.endpoint));
logDetail('Network call', String(approvalReply.payload.networkCall));
if (approvalReply.payload.approvalSummary !== undefined) {
  logDetail('Approval summary', JSON.stringify(approvalReply.payload.approvalSummary));
}

logStep('5. Alice sends proof-backed quote request to Bob');
const quoteRequest = await createProofBackedMessage({
  id: 'uniswap-live-quote-request-1',
  correlationId: 'uniswap-live-quote-session-1',
  type: 'uniswap.quote.request',
  sender: aliceIdentity.id,
  createdAt: now,
  credential,
  policy,
  state: { cumulativeSpend: 0n, updatedAt: now },
  action: createActionIntent({
    type: 'uniswap.quote',
    amount: BigInt(quoteBody.amount),
    metadata: {
      venue: 'uniswap-api',
      assetPair: 'USDC/WETH',
      chainId: quoteBody.tokenInChainId,
      tokenIn: quoteBody.tokenIn,
      tokenOut: quoteBody.tokenOut,
      slippageTolerance: quoteBody.slippageTolerance,
    },
  }),
  proof,
  now,
  payload: {
    policyHash,
    quote: quoteBody,
  },
});
const pendingReply = alicePeer.request(bobIdentity.id, quoteRequest, {
  expectedType: 'uniswap.quote.prepared',
  timeoutMs: options.replyTimeoutMs,
});
await alicePeer.send(bobIdentity.id, quoteRequest);
await transport.receive(quoteRequest);
const reply = (await pendingReply) as CorrelatedAgentMessage;
logDetail('Bob response', String(reply.payload.status));
logDetail('Endpoint', String(reply.payload.endpoint));
logDetail('Network call', String(reply.payload.networkCall));
if (reply.payload.quoteSummary !== undefined) {
  logDetail('Quote summary', JSON.stringify(reply.payload.quoteSummary));
}

logStep('6. Alice sends proof-backed swap preparation request to Bob');
const quoteForSwap = reply.payload.quoteForSwap ?? createLocalClassicQuoteForSwap();
const swapRequest = await createProofBackedMessage({
  id: 'uniswap-live-swap-prepare-request-1',
  correlationId: 'uniswap-live-quote-session-1',
  type: 'uniswap.swap.prepare.request',
  sender: aliceIdentity.id,
  createdAt: now,
  credential,
  policy,
  state: { cumulativeSpend: 0n, updatedAt: now },
  action: createActionIntent({
    type: 'uniswap.swap.prepare',
    amount: BigInt(quoteBody.amount),
    metadata: {
      venue: 'uniswap-api',
      assetPair: 'USDC/WETH',
      chainId: quoteBody.tokenInChainId,
      route: 'CLASSIC',
      tokenIn: quoteBody.tokenIn,
      tokenOut: quoteBody.tokenOut,
    },
  }),
  proof,
  now,
  payload: {
    policyHash,
    quoteForSwap,
  },
});
const pendingSwapReply = alicePeer.request(bobIdentity.id, swapRequest, {
  expectedType: 'uniswap.swap.prepared',
  timeoutMs: options.replyTimeoutMs,
});
await alicePeer.send(bobIdentity.id, swapRequest);
await transport.receive(swapRequest);
const swapReply = (await pendingSwapReply) as CorrelatedAgentMessage;
logDetail('Bob response', String(swapReply.payload.status));
logDetail('Endpoint', String(swapReply.payload.endpoint));
logDetail('Network call', String(swapReply.payload.networkCall));
if (swapReply.payload.swapSummary !== undefined) {
  logDetail('Swap summary', JSON.stringify(swapReply.payload.swapSummary));
}

logStep('7. What this proves');
logDetail('Trust boundary', 'Bob only prepares or calls Uniswap endpoints after verifying Alice proof');
logDetail('Safety', 'this example never submits approval, swap, or order transactions');

/** Installs Bob's proof gate before any Uniswap API work is prepared. */
function installBobQuoteGateway(options: LiveQuoteOptions): void {
  bobPeer.onMessage(async (message) => {
    if (message.type === 'uniswap.checkApproval.request') {
      await handleApprovalRequest(message, options);
    }

    if (message.type === 'uniswap.quote.request') {
      await handleQuoteRequest(message, options);
    }

    if (message.type === 'uniswap.swap.prepare.request') {
      await handleSwapPrepareRequest(message, options);
    }
  });
}

/** Verifies Alice's proof before approval work because approvals can authorize token spend. */
async function handleApprovalRequest(
  message: AgentMessage,
  options: LiveQuoteOptions,
): Promise<void> {
  logDetail('Bob received approval request', String(message.id ?? message.type));
  const verification = await verifyMessageAction(message, proof, {
    agentId: aliceIdentity.id,
    actionType: 'uniswap.checkApproval',
    policyHash,
  });

  if (!verification.valid) {
    throw new Error(`Bob rejected approval request: ${verification.reason}`);
  }

  logDetail('Bob verified approval proof', `${verification.action.type} ${String(verification.action.amount)}`);
  const endpoint = `${trimTrailingSlash(options.baseUrl)}/check_approval`;
  const prepared = createPreparedApprovalRequest(options, approvalBody);
  const approvalResponse = options.runNetworkRequest
    ? await requestUniswapApproval(endpoint, prepared, options)
    : undefined;
  const networkCall = options.runNetworkRequest ? 'submitted POST /check_approval' : 'disabled by default';

  logDetail('Prepared POST', endpoint);
  logDetail('Auth header', options.apiKey === undefined ? 'missing API key' : 'x-api-key configured');
  logDetail('Body amount', prepared.body.amount);
  logDetail('Approval target', 'Permit2 or proxy router, depending on x-permit2-disabled');
  if (approvalResponse !== undefined) {
    logDetail('Approval needed', String(approvalResponse.hasApprovalTransaction));
    logDetail('Cancel needed', String(approvalResponse.hasCancelTransaction));
  }

  const reply = createAgentReply({
    id: 'uniswap-live-approval-prepared-1',
    type: 'uniswap.checkApproval.prepared',
    sender: bobIdentity.id,
    createdAt: new Date('2026-04-30T12:00:01.000Z'),
    request: message as CorrelatedAgentMessage,
    payload: {
      status: 'prepared',
      endpoint,
      networkCall,
      request: prepared,
      approvalSummary: approvalResponse,
    },
  });

  await bobPeer.send(aliceIdentity.id, reply);
  await transport.receive(reply);
}

/** Verifies Alice's proof before quote work so API access is tied to delegated authority. */
async function handleQuoteRequest(
  message: AgentMessage,
  options: LiveQuoteOptions,
): Promise<void> {
  logDetail('Bob received quote request', String(message.id ?? message.type));
  const verification = await verifyMessageAction(message, proof, {
    agentId: aliceIdentity.id,
    actionType: 'uniswap.quote',
    policyHash,
  });

  if (!verification.valid) {
    throw new Error(`Bob rejected live quote request: ${verification.reason}`);
  }

  logDetail('Bob verified quote proof', `${verification.action.type} ${String(verification.action.amount)}`);
  const endpoint = `${trimTrailingSlash(options.baseUrl)}/quote`;
  const prepared = createPreparedQuoteRequest(options, quoteBody);
  const quoteResponse = options.runNetworkRequest
    ? await requestUniswapQuote(endpoint, prepared, options)
    : undefined;
  const networkCall = options.runNetworkRequest ? 'submitted POST /quote' : 'disabled by default';

  logDetail('Prepared POST', endpoint);
  logDetail('Auth header', options.apiKey === undefined ? 'missing API key' : 'x-api-key configured');
  logDetail('Body amount', prepared.body.amount);
  logDetail('Body pair', 'USDC/WETH');
  if (quoteResponse !== undefined) {
    logDetail('Uniswap request id', quoteResponse.summary.requestId ?? '<missing>');
    logDetail('Uniswap routing', quoteResponse.summary.routing ?? '<missing>');
  }

  const reply = createAgentReply({
    id: 'uniswap-live-quote-prepared-1',
    type: 'uniswap.quote.prepared',
    sender: bobIdentity.id,
    createdAt: new Date('2026-04-30T12:00:01.000Z'),
    request: message as CorrelatedAgentMessage,
    payload: {
      status: 'prepared',
      endpoint,
      networkCall,
      request: prepared,
      quoteSummary: quoteResponse?.summary,
      quoteForSwap: quoteResponse?.quoteForSwap ?? createLocalClassicQuoteForSwap(),
      permitData: quoteResponse?.permitData,
    },
  });

  await bobPeer.send(aliceIdentity.id, reply);
  await transport.receive(reply);
}

/** Verifies Alice's proof before turning a quote into unsigned swap calldata. */
async function handleSwapPrepareRequest(
  message: AgentMessage,
  options: LiveQuoteOptions,
): Promise<void> {
  logDetail('Bob received swap preparation request', String(message.id ?? message.type));
  const verification = await verifyMessageAction(message, proof, {
    agentId: aliceIdentity.id,
    actionType: 'uniswap.swap.prepare',
    policyHash,
  });

  if (!verification.valid) {
    throw new Error(`Bob rejected swap preparation request: ${verification.reason}`);
  }

  logDetail('Bob verified swap proof', `${verification.action.type} ${String(verification.action.amount)}`);
  const endpoint = `${trimTrailingSlash(options.baseUrl)}/swap`;
  const prepared = createPreparedSwapRequest(
    options,
    isRecord(message.payload.quoteForSwap) ? message.payload.quoteForSwap : createLocalClassicQuoteForSwap(),
    message.payload.permitData,
  );
  const swapResponse = options.runSwapNetworkRequest
    ? await requestUniswapSwap(endpoint, prepared, options)
    : undefined;
  const preparedValidation = validatePreparedSwapRequest(prepared);
  const networkCall = options.runSwapNetworkRequest ? 'submitted POST /swap' : 'disabled by default';

  logDetail('Prepared POST', endpoint);
  logDetail('Auth header', options.apiKey === undefined ? 'missing API key' : 'x-api-key configured');
  logDetail('Swap request valid', String(preparedValidation.transactionValid));
  logDetail('Broadcast', 'not performed by this example');

  const reply = createAgentReply({
    id: 'uniswap-live-swap-prepared-1',
    type: 'uniswap.swap.prepared',
    sender: bobIdentity.id,
    createdAt: new Date('2026-04-30T12:00:02.000Z'),
    request: message as CorrelatedAgentMessage,
    payload: {
      status: 'prepared',
      endpoint,
      networkCall,
      request: prepared,
      swapSummary: swapResponse ?? preparedValidation,
    },
  });

  await bobPeer.send(aliceIdentity.id, reply);
  await transport.receive(reply);
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

/**
 * Calls the Uniswap approval endpoint only after AgentIO verification has passed.
 *
 * Developers should inspect the returned transaction object and let the wallet
 * sign it only if the current delegated action still matches the agent policy.
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
 * Calls the Uniswap swap endpoint only after AgentIO verification has passed.
 *
 * The response is still only unsigned calldata. Applications must validate the
 * transaction shape, collect a wallet signature, and broadcast through their
 * own RPC path if the user still wants to execute.
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
 * Calls the Uniswap quote endpoint only after AgentIO verification has passed.
 *
 * Developers can use the returned summary to decide whether the next step is a
 * Permit2 signature, a classic /swap request, or a UniswapX /order request.
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

async function fetchJson(
  endpoint: string,
  request: PreparedApprovalRequest | PreparedQuoteRequest | PreparedSwapRequest,
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

function validatePreparedSwapRequest(request: PreparedSwapRequest): UniswapSwapSummary {
  return {
    hasSwapTransaction: false,
    transactionValid: isRecord(request.body.quote),
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

function createLocalClassicQuoteForSwap(): Record<string, unknown> {
  return {
    routing: 'CLASSIC',
    request: quoteBody,
    quoteId: 'local-uniswap-classic-quote',
    tokenIn: quoteBody.tokenIn,
    tokenOut: quoteBody.tokenOut,
    tokenInChainId: quoteBody.tokenInChainId,
    tokenOutChainId: quoteBody.tokenOutChainId,
    amount: quoteBody.amount,
    swapper: quoteBody.swapper,
  };
}

function readOptions(): LiveQuoteOptions {
  loadEnvFile();

  return {
    apiKey: readOptionalEnv('AGENTIO_UNISWAP_API_KEY'),
    permitSignature: readOptionalEnv('AGENTIO_UNISWAP_PERMIT_SIGNATURE'),
    baseUrl: process.env.AGENTIO_UNISWAP_API_BASE_URL ?? 'https://trade-api.gateway.uniswap.org/v1',
    universalRouterVersion: process.env.AGENTIO_UNISWAP_UNIVERSAL_ROUTER_VERSION ?? '2.0',
    erc20EthEnabled: process.env.AGENTIO_UNISWAP_ERC20_ETH_ENABLED === '1',
    permit2Disabled: process.env.AGENTIO_UNISWAP_PERMIT2_DISABLED === '1',
    runNetworkRequest: process.env.AGENTIO_UNISWAP_RUN_LIVE_API === '1' ||
      process.env.AGENTIO_UNISWAP_RUN_LIVE_QUOTE === '1',
    runSwapNetworkRequest: process.env.AGENTIO_UNISWAP_RUN_LIVE_SWAP === '1',
    replyTimeoutMs: readPositiveIntegerEnv('AGENTIO_UNISWAP_REPLY_TIMEOUT_MS') ?? 15_000,
  };
}

function readOptionalEnv(key: string): string | undefined {
  const value = process.env[key];
  return value === undefined || value === '' ? undefined : value;
}

function readPositiveIntegerEnv(key: string): number | undefined {
  const value = readOptionalEnv(key);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, '');
}

function loadEnvFile(path = '.env'): void {
  if (!existsSync(path)) {
    return;
  }

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const entry = parseEnvLine(line);
    if (entry !== undefined && process.env[entry.key] === undefined) {
      process.env[entry.key] = entry.value;
    }
  }
}

function parseEnvLine(
  line: string,
): { readonly key: string; readonly value: string } | undefined {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('#')) {
    return undefined;
  }

  const separator = trimmed.indexOf('=');
  if (separator === -1) {
    return undefined;
  }

  const key = trimmed.slice(0, separator).trim();
  if (!/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(key)) {
    return undefined;
  }

  return { key, value: unquoteEnvValue(trimmed.slice(separator + 1).trim()) };
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isNonEmptyHex(value: string | undefined): boolean {
  return value !== undefined && /^0x[0-9a-fA-F]+$/.test(value) && value !== '0x';
}

function isAddressLike(value: string | undefined): boolean {
  return value !== undefined && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function logTitle(title: string): void {
  console.log(`\n${title}`);
  console.log('='.repeat(title.length));
}

function logStep(message: string): void {
  console.log(`\n${message}`);
}

function logDetail(label: string, value: string): void {
  console.log(`  - ${label}: ${value}`);
}
