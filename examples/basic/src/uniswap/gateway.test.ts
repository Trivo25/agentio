import assert from 'node:assert/strict';
import test from 'node:test';

import type { LiveQuoteOptions } from './config.js';
import { createUniswapGateway } from './gateway.js';

const now = new Date('2026-04-30T12:00:00.000Z');
const baseOptions: LiveQuoteOptions = {
  apiKey: 'test-api-key',
  baseUrl: 'https://trade-api.gateway.uniswap.org/v1',
  universalRouterVersion: '2.0',
  erc20EthEnabled: false,
  permit2Disabled: false,
  runNetworkRequest: false,
  runSwapNetworkRequest: false,
  runOrderNetworkRequest: false,
  replyTimeoutMs: 15_000,
};

test('createUniswapGateway prepares approval and quote requests without network calls', async () => {
  const gateway = createUniswapGateway(baseOptions, now);

  const approval = await gateway.checkApproval({
    walletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    amount: '1250000000',
    chainId: 1,
    includeGasInfo: true,
  });
  assert.equal(approval.endpoint, 'https://trade-api.gateway.uniswap.org/v1/check_approval');
  assert.equal(approval.networkCall, 'disabled by default');
  assert.equal(approval.request.headers['x-api-key'], 'test-api-key');

  const quote = await gateway.quote({
    type: 'EXACT_INPUT',
    amount: '1250000000',
    tokenInChainId: 1,
    tokenOutChainId: 1,
    tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    swapper: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    slippageTolerance: 0.5,
    routingPreference: 'BEST_PRICE',
  });
  assert.equal(quote.endpoint, 'https://trade-api.gateway.uniswap.org/v1/quote');
  assert.equal(quote.request.headers['x-universal-router-version'], '2.0');
});

test('createUniswapGateway keeps swap and order live submission behind signatures', async () => {
  const liveSwap = createUniswapGateway({ ...baseOptions, runSwapNetworkRequest: true }, now);
  await assert.rejects(
    liveSwap.prepareSwap({ routing: 'CLASSIC' }, { permitAmount: '1' }),
    /AGENTIO_UNISWAP_PERMIT_SIGNATURE/,
  );

  const liveOrder = createUniswapGateway({ ...baseOptions, runOrderNetworkRequest: true }, now);
  await assert.rejects(
    liveOrder.prepareOrder({ routing: 'DUTCH_V2' }),
    /AGENTIO_UNISWAP_ORDER_SIGNATURE/,
  );
});
