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
import {
  createUniswapGateway,
  readString,
  type UniswapCheckApprovalRequestBody,
  type UniswapQuoteRequestBody,
} from './uniswap/gateway.js';
import { logDetail, logStep, logTitle } from './uniswap/logging.js';

/**
 * Prepares the proof-gated live Uniswap approval, quote, swap, and order flow.
 *
 * Bob verifies Alice's AgentIO proof before preparing or submitting Uniswap API
 * requests. The default mode does not call the network, so developers can
 * inspect the authorization boundary before enabling live API requests with
 * credentials.
 */

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
const uniswapGateway = createUniswapGateway(options, now);
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
  const approval = await uniswapGateway.checkApproval(approvalBody);

  logDetail('Prepared POST', approval.endpoint);
  logDetail('Auth header', options.apiKey === undefined ? 'missing API key' : 'x-api-key configured');
  logDetail('Body amount', approval.request.body.amount);
  logDetail('Approval target', 'Permit2 or proxy router, depending on x-permit2-disabled');
  if (approval.summary !== undefined) {
    logDetail('Approval needed', String(approval.summary.hasApprovalTransaction));
    logDetail('Cancel needed', String(approval.summary.hasCancelTransaction));
  }

  const reply = createAgentReply({
    id: 'uniswap-live-approval-prepared-1',
    type: 'uniswap.checkApproval.prepared',
    sender: bobIdentity.id,
    createdAt: new Date('2026-04-30T12:00:01.000Z'),
    request: message as CorrelatedAgentMessage,
    payload: {
      status: 'prepared',
      endpoint: approval.endpoint,
      networkCall: approval.networkCall,
      request: approval.request,
      approvalSummary: approval.summary,
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
  const quote = await uniswapGateway.quote(quoteBody);

  logDetail('Prepared POST', quote.endpoint);
  logDetail('Auth header', options.apiKey === undefined ? 'missing API key' : 'x-api-key configured');
  logDetail('Body amount', quote.request.body.amount);
  logDetail('Body pair', 'USDC/WETH');
  if (quote.result !== undefined) {
    logDetail('Uniswap request id', quote.result.summary.requestId ?? '<missing>');
    logDetail('Uniswap routing', quote.result.summary.routing ?? '<missing>');
  }

  const reply = createAgentReply({
    id: 'uniswap-live-quote-prepared-1',
    type: 'uniswap.quote.prepared',
    sender: bobIdentity.id,
    createdAt: new Date('2026-04-30T12:00:01.000Z'),
    request: message as CorrelatedAgentMessage,
    payload: {
      status: 'prepared',
      endpoint: quote.endpoint,
      networkCall: quote.networkCall,
      request: quote.request,
      quoteSummary: quote.result?.summary,
      quoteForSwap: quote.result?.quoteForSwap ?? createLocalClassicQuoteForSwap(),
      permitData: quote.result?.permitData,
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
  const swap = await uniswapGateway.prepareSwap(
    isRecord(message.payload.quoteForSwap) ? message.payload.quoteForSwap : createLocalClassicQuoteForSwap(),
    message.payload.permitData,
  );

  logDetail('Prepared POST', swap.endpoint);
  logDetail('Auth header', options.apiKey === undefined ? 'missing API key' : 'x-api-key configured');
  logDetail('Swap request valid', String(swap.summary.transactionValid));
  logDetail('Broadcast', 'not performed by this example');

  const reply = createAgentReply({
    id: 'uniswap-live-swap-prepared-1',
    type: 'uniswap.swap.prepared',
    sender: bobIdentity.id,
    createdAt: new Date('2026-04-30T12:00:02.000Z'),
    request: message as CorrelatedAgentMessage,
    payload: {
      status: 'prepared',
      endpoint: swap.endpoint,
      networkCall: swap.networkCall,
      request: swap.request,
      swapSummary: swap.summary,
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
  const order = await uniswapGateway.prepareOrder(quote);

  logDetail('Prepared POST', order.endpoint);
  logDetail('Auth header', options.apiKey === undefined ? 'missing API key' : 'x-api-key configured');
  logDetail('Order route', readString(quote.routing) ?? '<missing>');
  logDetail('Order signature', order.summary.hasSignature ? 'configured' : 'required before live submit');
  logDetail('Broadcast', 'not performed by this example');

  const reply = createAgentReply({
    id: 'uniswap-live-order-prepared-1',
    type: 'uniswap.order.prepared',
    sender: bobIdentity.id,
    createdAt: new Date('2026-04-30T12:00:03.000Z'),
    request: message as CorrelatedAgentMessage,
    payload: {
      status: 'prepared',
      endpoint: order.endpoint,
      networkCall: order.networkCall,
      request: order.request,
      orderSummary: order.summary,
    },
  });

  await bobPeer.send(aliceIdentity.id, reply);
  await transport.receive(reply);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
