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
 * Prepares the proof-gated live Uniswap quote flow.
 *
 * This example is intentionally quote-only. Bob verifies Alice's AgentIO proof
 * before preparing or submitting the Uniswap API /quote request. The default
 * mode does not call the network, so developers can inspect the authorization
 * boundary before enabling a live API request with credentials.
 */

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

type LiveQuoteOptions = {
  readonly apiKey?: string;
  readonly baseUrl: string;
  readonly universalRouterVersion: string;
  readonly erc20EthEnabled: boolean;
  readonly permit2Disabled: boolean;
  readonly runNetworkRequest: boolean;
};

type PreparedQuoteRequest = {
  readonly method: 'POST';
  readonly headers: Record<string, string>;
  readonly body: UniswapQuoteRequestBody;
};

type UniswapQuoteSummary = {
  readonly requestId?: string;
  readonly routing?: string;
  readonly hasPermitData?: boolean;
  readonly hasPermitTransaction?: boolean;
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

const options = readOptions();

logTitle('AgentIO Uniswap live quote');
logStep('1. Create Alice and Bob');
const aliceIdentity = createAgentIdentity({
  id: 'agent-alice-live-uniswap-quote',
  publicKey: 'agent-public-key-alice-live-uniswap-quote',
});
const bobIdentity = createAgentIdentity({
  id: 'agent-bob-uniswap-api-gateway',
  publicKey: 'agent-public-key-bob-uniswap-api-gateway',
});
logDetail('Alice', 'agent that wants a real Uniswap API quote');
logDetail('Bob', 'gateway that verifies proof before preparing /quote');

logStep('2. Delegate quote-only Uniswap authority');
const policy = createPolicy({
  id: 'policy-uniswap-live-quote-only',
  allowedActions: ['uniswap.quote'],
  constraints: [
    {
      type: 'max-amount',
      value: BigInt(quoteBody.amount),
      actionTypes: ['uniswap.quote'],
    },
    {
      type: 'allowed-metadata-value',
      key: 'venue',
      values: ['uniswap-api'],
      actionTypes: ['uniswap.quote'],
    },
    {
      type: 'allowed-metadata-value',
      key: 'assetPair',
      values: ['USDC/WETH'],
      actionTypes: ['uniswap.quote'],
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
logDetail('Allowed action', 'uniswap.quote');
logDetail('Policy commitment', policyHash);

logStep('3. Create local proof and transport adapters');
const proof = localNoirProofs();
const transport = localAxlTransport('agentio/uniswap-live-quote');
const alicePeer = createAgentPeer({ identity: aliceIdentity, transport });
const bobPeer = createAgentPeer({ identity: bobIdentity, transport });
installBobQuoteGateway(options);
logDetail('Proof', 'local Noir-shaped proof tied to the quote action');
logDetail('Transport', 'local AXL-shaped message delivery');

logStep('4. Alice sends proof-backed quote request to Bob');
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
  timeoutMs: 1_000,
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

logStep('5. What this proves');
logDetail('Trust boundary', 'Bob only prepares or calls /quote after verifying Alice proof');
logDetail('Safety', 'this example never submits approval, swap, or order transactions');

/** Installs Bob's proof gate before any Uniswap API quote work is prepared. */
function installBobQuoteGateway(options: LiveQuoteOptions): void {
  bobPeer.onMessage(async (message) => {
    if (message.type !== 'uniswap.quote.request') {
      return;
    }

    await handleQuoteRequest(message, options);
  });
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
    logDetail('Uniswap request id', quoteResponse.requestId ?? '<missing>');
    logDetail('Uniswap routing', quoteResponse.routing ?? '<missing>');
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
      quoteSummary: quoteResponse,
    },
  });

  await bobPeer.send(aliceIdentity.id, reply);
  await transport.receive(reply);
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
): Promise<UniswapQuoteSummary> {
  if (options.apiKey === undefined) {
    throw new Error('AGENTIO_UNISWAP_API_KEY is required when AGENTIO_UNISWAP_RUN_LIVE_QUOTE=1.');
  }

  logDetail('Live quote', 'submitting POST /quote');
  const response = await fetch(endpoint, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body),
  });
  const responseText = await response.text();
  const responseBody = parseJsonResponse(responseText);

  if (!response.ok) {
    throw new Error(
      `Uniswap /quote failed with ${response.status} ${response.statusText}: ${responseText}`,
    );
  }

  return summarizeQuoteResponse(responseBody);
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

function readOptions(): LiveQuoteOptions {
  loadEnvFile();

  return {
    apiKey: readOptionalEnv('AGENTIO_UNISWAP_API_KEY'),
    baseUrl: process.env.AGENTIO_UNISWAP_API_BASE_URL ?? 'https://trade-api.gateway.uniswap.org/v1',
    universalRouterVersion: process.env.AGENTIO_UNISWAP_UNIVERSAL_ROUTER_VERSION ?? '2.0',
    erc20EthEnabled: process.env.AGENTIO_UNISWAP_ERC20_ETH_ENABLED === '1',
    permit2Disabled: process.env.AGENTIO_UNISWAP_PERMIT2_DISABLED === '1',
    runNetworkRequest: process.env.AGENTIO_UNISWAP_RUN_LIVE_QUOTE === '1',
  };
}

function readOptionalEnv(key: string): string | undefined {
  const value = process.env[key];
  return value === undefined || value === '' ? undefined : value;
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
