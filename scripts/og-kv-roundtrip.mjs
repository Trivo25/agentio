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
  const key = Buffer.from('Apple', 'utf8');
  const value = Buffer.from('A fruit that keeps the doctor away.', 'utf8');

  console.log('0G KV SDK-only round trip');
  console.log(`Stream id: ${options.streamId}`);
  console.log(`Key: ${key}`);
  console.log(`Encoded key: ${encodeKeyForRead(key)}`);
  console.log(`Value: ${value}`);
  console.log('');

  const provider = new ethers.JsonRpcProvider(options.evmRpc);
  const signer = new ethers.Wallet(options.privateKey, provider);
  const indexer = new Indexer(options.indexerRpc);
  const kv = new KvClient(options.kvRpc);

  console.log('Selecting storage node(s)...');
  const [nodes, selectError] = await indexer.selectNodes(
    options.expectedReplica,
  );
  if (selectError !== null) {
    throw new Error(`0G node selection failed: ${selectError.message}`);
  }
  console.log(`Selected nodes: ${nodes.map(formatNode).join(', ')}`);

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
  batcher.streamDataBuilder.set(options.streamId, key, value);

  console.log('Writing KV entry...');
  const [result, uploadError] = await batcher.exec({
    finalityRequired: options.finalityRequired,
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
  console.log(`txSeq: ${readTxSeq(result) ?? '<unknown>'}`);
  console.log('');

  console.log('Reading latest KV value...');
  const encodedKey = encodeKeyForRead(key);
  const valueRead = await readWithRetry(
    kv,
    options.streamId,
    encodedKey,
    options.readTimeoutMs,
    options.readIntervalMs,
  );
  if (valueRead === null) {
    throw new Error('KV read returned null for the written key.');
  }

  const decoded = Buffer.from(valueRead.data, 'base64').toString('utf8');
  console.log(`Read version: ${valueRead.version}`);
  console.log(`Read size: ${valueRead.size}`);
  console.log(`Decoded value: ${decoded}`);

  if (decoded !== Buffer.from(value, 'base64').toString('utf8')) {
    throw new Error(
      `Round trip mismatch. Expected ${JSON.stringify(value)}, got ${JSON.stringify(decoded)}.`,
    );
  }

  console.log('Round trip ok.');
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
    30_000,
  );
  const readIntervalMs = readPositiveInteger(
    readArgValue('--read-interval-ms') ??
      process.env.AGENTIO_0G_KV_READ_RETRY_INTERVAL_MS,
    500,
  );
  const finalityRequired = readBoolean(
    readArgValue('--finality') ?? process.env.AGENTIO_0G_FINALITY_REQUIRED,
    false,
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
    readIntervalMs,
    finalityRequired,
  };
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
