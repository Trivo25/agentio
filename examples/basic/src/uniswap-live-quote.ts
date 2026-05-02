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

import { readLiveQuoteOptions, type LiveQuoteOptions } from './uniswap/config.js';
import { logDetail, logStep, logTitle } from './uniswap/logging.js';

/**
 * Prepares the proof-gated live Uniswap approval, quote, swap, and order flow.
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

type UniswapOrderRequestBody = {
  readonly quote: unknown;
  readonly signature: string;
  readonly routing?: string;
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

type PreparedOrderRequest = {
  readonly method: 'POST';
  readonly headers: Record<string, string>;
  readonly body: UniswapOrderRequestBody;
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

type UniswapOrderSummary = {
  readonly requestId?: string;
  readonly orderId?: string;
  readonly orderStatus?: string;
  readonly hasSignature: boolean;
};

type UniswapExecutionEndpoint = 'order' | 'swap' | 'unsupported';

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

const options = readLiveQuoteOptions();
const aliceIdentity = createAgentIdentity({
  id: 'agent-alice-live-uniswap-quote',
  publicKey: 'agent-public-key-alice-live-uniswap-quote',
});
const bobIdentity = createAgentIdentity({
  id: 'agent-bob-uniswap-api-gateway',
  publicKey: 'agent-public-key-bob-uniswap-api-gateway',
});
const policy = createPolicy({
  id: 'policy-uniswap-live-approval-and-quote',
  allowedActions: ['uniswap.checkApproval', 'uniswap.quote', 'uniswap.swap.prepare', 'uniswap.order.prepare'],
  constraints: [
    {
      type: 'max-amount',
      value: BigInt(quoteBody.amount),
      actionTypes: ['uniswap.checkApproval', 'uniswap.quote', 'uniswap.swap.prepare', 'uniswap.order.prepare'],
    },
    {
      type: 'allowed-metadata-value',
      key: 'venue',
      values: ['uniswap-api'],
      actionTypes: ['uniswap.checkApproval', 'uniswap.quote', 'uniswap.swap.prepare', 'uniswap.order.prepare'],
    },
    {
      type: 'allowed-metadata-value',
      key: 'assetPair',
      values: ['USDC/WETH'],
      actionTypes: ['uniswap.checkApproval', 'uniswap.quote', 'uniswap.swap.prepare', 'uniswap.order.prepare'],
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
const proof = localNoirProofs();
const transport = localAxlTransport('agentio/uniswap-live-quote');
const alicePeer = createAgentPeer({ identity: aliceIdentity, transport });
const bobPeer = createAgentPeer({ identity: bobIdentity, transport });
installBobQuoteGateway(options);

await runUniswapPreparationDemo();

async function runUniswapPreparationDemo(): Promise<void> {
  logTitle('AgentIO Uniswap live approval, quote, swap, and order preparation');

  logStep('1. Create Alice and Bob');
  logDetail('Alice', 'agent that wants Uniswap approval and quote work');
  logDetail('Bob', 'gateway that verifies proof before preparing Uniswap API requests');

  logStep('2. Delegate approval-check, quote, swap, and order-preparation authority');
  logDetail('Allowed actions', 'uniswap.checkApproval, uniswap.quote, uniswap.swap.prepare, uniswap.order.prepare');
  logDetail('Policy commitment', policyHash);

  logStep('3. Create local proof and transport adapters');
  logDetail('Proof', 'local Noir-shaped proof tied to each Uniswap action');
  logDetail('Transport', 'local AXL-shaped message delivery');

  await requestApprovalCheck();
  const quoteReply = await requestQuote();
  await requestSwapPreparation(quoteReply.payload.quoteForSwap ?? createLocalClassicQuoteForSwap());
  await requestOrderPreparation(createLocalUniswapXQuoteForOrder());

  logStep('8. What this proves');
  logDetail('Trust boundary', 'Bob only prepares or calls Uniswap endpoints after verifying Alice proof');
  logDetail('Safety', 'this example never submits approval, swap, or order transactions');
}

async function requestApprovalCheck(): Promise<CorrelatedAgentMessage> {
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
  const reply = await sendProofBackedRequest(approvalRequest, 'uniswap.checkApproval.prepared');
  logGatewayReply(reply, 'Approval summary', reply.payload.approvalSummary);
  return reply;
}

async function requestQuote(): Promise<CorrelatedAgentMessage> {
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
  const reply = await sendProofBackedRequest(quoteRequest, 'uniswap.quote.prepared');
  logGatewayReply(reply, 'Quote summary', reply.payload.quoteSummary);
  return reply;
}

async function requestSwapPreparation(quoteForSwap: unknown): Promise<CorrelatedAgentMessage> {
  logStep('6. Alice sends proof-backed swap preparation request to Bob');
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
  const reply = await sendProofBackedRequest(swapRequest, 'uniswap.swap.prepared');
  logGatewayReply(reply, 'Swap summary', reply.payload.swapSummary);
  return reply;
}

async function requestOrderPreparation(quoteForOrder: Record<string, unknown>): Promise<CorrelatedAgentMessage> {
  logStep('7. Alice sends proof-backed UniswapX order preparation request to Bob');
  const orderRequest = await createProofBackedMessage({
    id: 'uniswap-live-order-prepare-request-1',
    correlationId: 'uniswap-live-quote-session-1',
    type: 'uniswap.order.prepare.request',
    sender: aliceIdentity.id,
    createdAt: now,
    credential,
    policy,
    state: { cumulativeSpend: 0n, updatedAt: now },
    action: createActionIntent({
      type: 'uniswap.order.prepare',
      amount: BigInt(quoteBody.amount),
      metadata: {
        venue: 'uniswap-api',
        assetPair: 'USDC/WETH',
        chainId: quoteBody.tokenInChainId,
        route: 'DUTCH_V2',
        tokenIn: quoteBody.tokenIn,
        tokenOut: quoteBody.tokenOut,
      },
    }),
    proof,
    now,
    payload: {
      policyHash,
      quoteForOrder,
    },
  });
  const reply = await sendProofBackedRequest(orderRequest, 'uniswap.order.prepared');
  logGatewayReply(reply, 'Order summary', reply.payload.orderSummary);
  return reply;
}

async function sendProofBackedRequest(
  message: CorrelatedAgentMessage,
  expectedType: string,
): Promise<CorrelatedAgentMessage> {
  const pendingReply = alicePeer.request(bobIdentity.id, message, {
    expectedType,
    timeoutMs: options.replyTimeoutMs,
  });
  await alicePeer.send(bobIdentity.id, message);
  await transport.receive(message);
  return (await pendingReply) as CorrelatedAgentMessage;
}

function logGatewayReply(
  reply: CorrelatedAgentMessage,
  summaryLabel: string,
  summary: unknown,
): void {
  logDetail('Bob response', String(reply.payload.status));
  logDetail('Endpoint', String(reply.payload.endpoint));
  logDetail('Network call', String(reply.payload.networkCall));
  if (summary !== undefined) {
    logDetail(summaryLabel, JSON.stringify(summary));
  }
}

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

    if (message.type === 'uniswap.order.prepare.request') {
      await handleOrderPrepareRequest(message, options);
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

/** Verifies Alice's proof before preparing a UniswapX gasless order submission. */
async function handleOrderPrepareRequest(
  message: AgentMessage,
  options: LiveQuoteOptions,
): Promise<void> {
  logDetail('Bob received order preparation request', String(message.id ?? message.type));
  const verification = await verifyMessageAction(message, proof, {
    agentId: aliceIdentity.id,
    actionType: 'uniswap.order.prepare',
    policyHash,
  });

  if (!verification.valid) {
    throw new Error(`Bob rejected order preparation request: ${verification.reason}`);
  }

  logDetail('Bob verified order proof', `${verification.action.type} ${String(verification.action.amount)}`);
  const quote = isRecord(message.payload.quoteForOrder)
    ? message.payload.quoteForOrder
    : createLocalUniswapXQuoteForOrder();
  const endpointName = routeToExecutionEndpoint(readString(quote.routing));
  if (endpointName !== 'order') {
    throw new Error(`Bob expected a UniswapX order route but received ${endpointName}.`);
  }

  const endpoint = `${trimTrailingSlash(options.baseUrl)}/order`;
  const prepared = createPreparedOrderRequest(options, quote);
  const orderResponse = options.runOrderNetworkRequest
    ? await requestUniswapOrder(endpoint, prepared, options)
    : undefined;
  const preparedValidation = validatePreparedOrderRequest(prepared);
  const networkCall = options.runOrderNetworkRequest ? 'submitted POST /order' : 'disabled by default';

  logDetail('Prepared POST', endpoint);
  logDetail('Auth header', options.apiKey === undefined ? 'missing API key' : 'x-api-key configured');
  logDetail('Order route', readString(quote.routing) ?? '<missing>');
  logDetail('Order signature', preparedValidation.hasSignature ? 'configured' : 'required before live submit');
  logDetail('Broadcast', 'not performed by this example');

  const reply = createAgentReply({
    id: 'uniswap-live-order-prepared-1',
    type: 'uniswap.order.prepared',
    sender: bobIdentity.id,
    createdAt: new Date('2026-04-30T12:00:03.000Z'),
    request: message as CorrelatedAgentMessage,
    payload: {
      status: 'prepared',
      endpoint,
      networkCall,
      request: prepared,
      orderSummary: orderResponse ?? preparedValidation,
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
 * Calls the UniswapX order endpoint only after AgentIO verification has passed.
 *
 * The endpoint submits a signed intent to the filler network. This example keeps
 * it behind a separate opt-in flag because an order can become executable once
 * signed and accepted by UniswapX.
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

function createLocalUniswapXQuoteForOrder(): Record<string, unknown> {
  return {
    routing: 'DUTCH_V2',
    encodedOrder: '0xlocal-uniswapx-order',
    orderId: 'local-uniswapx-order',
    quoteId: 'local-uniswapx-quote',
    tokenIn: quoteBody.tokenIn,
    tokenOut: quoteBody.tokenOut,
    tokenInChainId: quoteBody.tokenInChainId,
    tokenOutChainId: quoteBody.tokenOutChainId,
    amount: quoteBody.amount,
    swapper: quoteBody.swapper,
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
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
