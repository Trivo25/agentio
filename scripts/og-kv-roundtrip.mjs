#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import {
  Batcher,
  Indexer,
  KvClient,
  getFlowContract,
} from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';

loadEnvFile();

const options = readOptions();

if (!options.ready) {
  console.error(options.reason);
  process.exit(1);
}

await roundTrip(options);

async function roundTrip(options) {
  console.log('0G KV SDK-only round trip');
  console.log(`Stream id: ${options.streamId}`);
  console.log(`Key: ${options.key}`);
  console.log(`Encoded key: ${encodeKeyForRead(options.key)}`);
  console.log(`Value: ${options.value}`);
  console.log('');

  const provider = new ethers.JsonRpcProvider(options.evmRpc);
  const signer = new ethers.Wallet(options.privateKey, provider);
  const kv = new KvClient(options.kvRpc);

  const nodes = await resolveStorageNodes(options);

  const status = await nodes[0]?.getStatus();
  const flowAddress = status?.networkIdentity.flowAddress;
  if (flowAddress === undefined) {
    throw new Error(
      'Selected storage node did not return a flow contract address.',
    );
  }
  console.log(`Flow contract: ${flowAddress}`);

  const flow = getFlowContract(flowAddress, signer);
  const batcher = new Batcher(
    options.batchVersion,
    nodes,
    flow,
    options.evmRpc,
  );
  batcher.streamDataBuilder.set(
    options.streamId,
    Buffer.from(options.key, 'utf8'),
    Buffer.from(options.value, 'utf8'),
  );

  console.log('Writing KV entry...');
  const [result, uploadError] = await batcher.exec({
    finalityRequired: options.finalityRequired,
    expectedReplica: options.expectedReplica,
    onProgress(message) {
      console.log(`[0G] ${message}`);
    },
  });
  if (uploadError !== null) {
    throw new Error(`0G KV write failed: ${uploadError.message}`);
  }

  console.log('Write complete.');
  console.log(`txHash: ${result.txHash}`);
  console.log(`rootHash: ${result.rootHash}`);
  const txSeq = readTxSeq(result);
  console.log(`txSeq: ${txSeq ?? '<unknown>'}`);
  console.log('');

  if (txSeq !== undefined) {
    await printStorageFileInfo(nodes, txSeq);
  }

  await printKvNodeDiagnostics(kv, options.kvRpc, txSeq);
  if (txSeq !== undefined) {
    await waitForKvTransactionResult(
      options.kvRpc,
      txSeq,
      options.transactionTimeoutMs,
      options.readIntervalMs,
    );
  }

  console.log('Reading latest KV value...');
  const encodedKey = encodeKeyForRead(options.key);
  const value = await readWithRetry(
    kv,
    options.streamId,
    encodedKey,
    options.readTimeoutMs,
    options.readIntervalMs,
  );
  if (value === null) {
    throw new Error('KV read returned null for the written key.');
  }

  const decoded = Buffer.from(value.data, 'base64').toString('utf8');
  console.log(`Read version: ${value.version}`);
  console.log(`Read size: ${value.size}`);
  console.log(`Decoded value: ${decoded}`);

  if (decoded !== options.value) {
    throw new Error(
      `Round trip mismatch. Expected ${JSON.stringify(options.value)}, got ${JSON.stringify(decoded)}. Raw value: ${JSON.stringify(value)}.`,
    );
  }

  console.log('Round trip ok.');
}

async function printKvNodeDiagnostics(kv, kvRpc, txSeq) {
  try {
    const streamIds = await kv.getHoldingStreamIds();
    console.log(`KV node holding stream ids: ${JSON.stringify(streamIds)}`);
  } catch (error) {
    console.log(`KV node holding stream ids: failed: ${formatError(error)}`);
  }

  if (txSeq === undefined) {
    return;
  }

  try {
    const transactionResult = await getKvTransactionResult(kvRpc, txSeq);
    console.log(
      `KV transaction result for txSeq ${txSeq}: ${JSON.stringify(transactionResult)}`,
    );
  } catch (error) {
    console.log(
      `KV transaction result for txSeq ${txSeq}: failed: ${formatError(error)}`,
    );
  }

  console.log('');
}

async function printStorageFileInfo(nodes, txSeq) {
  for (const [index, node] of nodes.entries()) {
    try {
      const info = await node.getFileInfoByTxSeq(txSeq);
      console.log(
        `Storage node[${index}] file info for txSeq ${txSeq}: ${JSON.stringify(info)}`,
      );
    } catch (error) {
      console.log(
        `Storage node[${index}] file info for txSeq ${txSeq}: failed: ${formatError(error)}`,
      );
    }
  }
  console.log('');
}

async function getKvTransactionResult(kvRpc, txSeq) {
  const response = await fetch(kvRpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'kv_getTransactionResult',
      params: [txSeq],
    }),
  });
  const payload = await response.json();
  if (payload.error !== undefined) {
    throw new Error(JSON.stringify(payload.error));
  }

  return payload.result;
}

async function waitForKvTransactionResult(kvRpc, txSeq, timeoutMs, intervalMs) {
  const startedAt = Date.now();

  while (true) {
    const result = await getKvTransactionResult(kvRpc, txSeq);
    if (result !== null && result !== undefined) {
      console.log(`KV transaction result became visible for txSeq ${txSeq}.`);
      return result;
    }

    if (Date.now() - startedAt >= timeoutMs) {
      console.log(
        `KV transaction result is still missing for txSeq ${txSeq} after ${timeoutMs}ms; continuing to value read anyway.`,
      );
      return result;
    }

    console.log(
      `[0G] KV transaction result missing for txSeq ${txSeq}; waiting for KV indexing...`,
    );
    await delay(intervalMs);
  }
}

function readOptions() {
  const evmRpc = process.env.AGENTIO_0G_EVM_RPC;
  const indexerRpc = process.env.AGENTIO_0G_INDEXER_RPC;
  const kvRpc = process.env.AGENTIO_0G_KV_RPC;
  const privateKey = process.env.AGENTIO_0G_PRIVATE_KEY;
  const streamId = process.env.AGENTIO_0G_STREAM_ID;
  const key = readArgValue('--key') ?? `agentio-sdk-only-${Date.now()}`;
  const value =
    readArgValue('--value') ?? `hello 0g kv ${new Date().toISOString()}`;
  const expectedReplica = readPositiveInteger(
    readArgValue('--replica') ?? process.env.AGENTIO_0G_EXPECTED_REPLICA,
    1,
  );
  const batchVersion = readPositiveInteger(
    readArgValue('--batch-version') ?? process.env.AGENTIO_0G_BATCH_VERSION,
    1,
  );
  const readTimeoutMs = readPositiveInteger(
    readArgValue('--read-timeout-ms') ??
      process.env.AGENTIO_0G_KV_READ_RETRY_TIMEOUT_MS,
    120_000,
  );
  const transactionTimeoutMs = readPositiveInteger(
    readArgValue('--tx-timeout-ms') ??
      process.env.AGENTIO_0G_KV_TX_RESULT_TIMEOUT_MS,
    readTimeoutMs,
  );
  const readIntervalMs = readPositiveInteger(
    readArgValue('--read-interval-ms') ??
      process.env.AGENTIO_0G_KV_READ_RETRY_INTERVAL_MS,
    500,
  );
  const finalityRequired = readBoolean(
    readArgValue('--finality') ?? process.env.AGENTIO_0G_FINALITY_REQUIRED,
    true,
  );

  const missing = [
    ['AGENTIO_0G_EVM_RPC', evmRpc],
    ['AGENTIO_0G_INDEXER_RPC', indexerRpc],
    ['AGENTIO_0G_KV_RPC', kvRpc],
    ['AGENTIO_0G_PRIVATE_KEY', privateKey],
    ['AGENTIO_0G_STREAM_ID', streamId],
  ]
    .filter(([, value]) => value === undefined || value === '')
    .map(([name]) => name);

  if (missing.length > 0) {
    return {
      ready: false,
      reason: `Missing required env vars: ${missing.join(', ')}`,
    };
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    return {
      ready: false,
      reason:
        'AGENTIO_0G_PRIVATE_KEY must be a 0x-prefixed 32-byte private key.',
    };
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(streamId)) {
    return {
      ready: false,
      reason: 'AGENTIO_0G_STREAM_ID must be a 0x-prefixed 32-byte stream id.',
    };
  }

  return {
    ready: true,
    evmRpc,
    indexerRpc,
    kvRpc,
    privateKey,
    streamId,
    key,
    value,
    expectedReplica,
    batchVersion,
    readTimeoutMs,
    transactionTimeoutMs,
    readIntervalMs,
    finalityRequired,
  };
}

async function resolveStorageNodes(options) {
  console.log('Selecting storage node(s) from indexer...');
  const indexer = new Indexer(options.indexerRpc);
  const [nodes, selectError] = await indexer.selectNodes(
    options.expectedReplica,
  );
  if (selectError !== null) {
    throw new Error(`0G node selection failed: ${selectError.message}`);
  }
  console.log(`Selected nodes: ${nodes.map(formatNode).join(', ')}`);
  return nodes;
}

async function readWithRetry(kv, streamId, encodedKey, timeoutMs, intervalMs) {
  const startedAt = Date.now();

  while (true) {
    const value = await kv.getValue(streamId, encodedKey);
    if (value === null || value.data !== '') {
      return value;
    }

    if (Date.now() - startedAt >= timeoutMs) {
      return value;
    }

    console.log(
      '[0G] KV returned an empty value; waiting for read visibility...',
    );
    await delay(intervalMs);
  }
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function encodeKeyForRead(key) {
  return ethers.encodeBase64(Buffer.from(key, 'utf8'));
}

function readTxSeq(result) {
  return typeof result.txSeq === 'number' ? result.txSeq : undefined;
}

function formatNode(node) {
  return typeof node?.url === 'string' && node.url !== ''
    ? node.url
    : '<unknown-node-url>';
}

function loadEnvFile(path = '.env') {
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

function parseEnvLine(line) {
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

  return { key, value: unquote(trimmed.slice(separator + 1).trim()) };
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function readArgValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function readPositiveInteger(value, fallback) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoolean(value, fallback) {
  if (value === undefined || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
