#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { ethers } from 'ethers';
import { KvClient } from '@0gfoundation/0g-ts-sdk';

loadEnvFile();

const kvRpc = process.env.AGENTIO_0G_KV_RPC;
const streamId = process.env.AGENTIO_0G_STREAM_ID;
const probeKey = readArgValue('--key') ?? process.env.AGENTIO_0G_KV_PROBE_KEY;
const probeVersion = readPositiveInteger(readArgValue('--version') ?? process.env.AGENTIO_0G_KV_PROBE_VERSION, undefined);
const probeTxSeq = readPositiveInteger(readArgValue('--txSeq') ?? process.env.AGENTIO_0G_KV_PROBE_TX_SEQ, undefined);
const readRetryTimeoutMs = readPositiveInteger(
  readArgValue('--read-timeout-ms') ?? process.env.AGENTIO_0G_KV_READ_RETRY_TIMEOUT_MS,
  10_000,
);
const readRetryIntervalMs = readPositiveInteger(
  readArgValue('--read-interval-ms') ?? process.env.AGENTIO_0G_KV_READ_RETRY_INTERVAL_MS,
  500,
);

console.log('0G KV diagnostics');
console.log('');
printConfig();

if (kvRpc === undefined || kvRpc === '') {
  console.log('Status: blocked');
  console.log('Reason: AGENTIO_0G_KV_RPC is not set. Use the RPC URL for your own 0G KV node.');
  process.exitCode = 1;
} else if (streamId === undefined || streamId === '') {
  console.log('Status: blocked');
  console.log('Reason: AGENTIO_0G_STREAM_ID is not set.');
  process.exitCode = 1;
} else if (!isBytes32(streamId)) {
  console.log('Status: blocked');
  console.log('Reason: AGENTIO_0G_STREAM_ID must be a 0x-prefixed 32-byte hex value.');
  process.exitCode = 1;
} else {
  await runDiagnostics({ kvRpc, streamId, probeKey, probeVersion, probeTxSeq, readRetryTimeoutMs, readRetryIntervalMs });
}

async function runDiagnostics(options) {
  const client = new KvClient(options.kvRpc);

  try {
    console.log('Checking KV RPC response...');
    const streamIds = await withTimeout(client.getHoldingStreamIds(), 10_000, 'KV RPC did not respond within 10000ms.');
    console.log('KV RPC: ok');
    console.log(`Holding stream ids: ${formatJson(streamIds)}`);
  } catch (error) {
    console.log('KV RPC: failed');
    console.log(`Error: ${formatError(error)}`);
    process.exitCode = 1;
    return;
  }

  if (options.probeKey === undefined || options.probeKey === '') {
    console.log('');
    console.log('Probe read: skipped');
    console.log('Tip: pass --key <logical-key> to probe a specific AgentIO key.');
    console.log('Example key shape: agentio-live/agents/<agent-id>/state/latest');
  } else {
    await probeKeyValue(client, options);
  }

  if (options.probeTxSeq !== undefined) {
    await probeTransactionResult(client, options.probeTxSeq);
  }
}

async function probeKeyValue(client, options) {
  const encodedKey = ethers.encodeBase64(Buffer.from(options.probeKey, 'utf8'));
  console.log('');
  console.log(`Probe key: ${options.probeKey}`);
  console.log(`Probe key encoded for 0G KV: ${encodedKey}`);
  console.log(`Read retry timeout: ${options.readRetryTimeoutMs}ms`);

  try {
    const value = await readValueWithRetry(client, options.streamId, encodedKey, options.probeVersion, options);

    if (value === null) {
      console.log('Probe read: missing');
      console.log('Meaning: the node does not currently have this key for the configured stream id/version.');
      return;
    }

    const decoded = Buffer.from(value.data, 'base64').toString('utf8');
    console.log('Probe read: found');
    console.log(`Value version: ${value.version}`);
    console.log(`Value size: ${value.size}`);
    console.log(`Decoded value bytes: ${decoded.length}`);
    console.log(decoded === '' ? 'Decoded value: <empty>' : `Decoded value preview: ${decoded.slice(0, 500)}`);
    printDocumentShape(decoded);
  } catch (error) {
    console.log('Probe read: failed');
    console.log(`Error: ${formatError(error)}`);
    process.exitCode = 1;
  }
}

async function probeTransactionResult(client, txSeq) {
  console.log('');
  console.log(`Probe txSeq: ${txSeq}`);

  try {
    const result = await withTimeout(
      client.getTransactionResult(txSeq),
      10_000,
      'KV transaction-result read did not respond within 10000ms.',
    );
    console.log('Transaction result: found');
    console.log(formatJson(result));
  } catch (error) {
    console.log('Transaction result: failed');
    console.log(`Error: ${formatError(error)}`);
    process.exitCode = 1;
  }
}

function printConfig() {
  console.log(`KV RPC: ${kvRpc ?? '<missing>'}`);
  console.log(`Stream id: ${streamId ?? '<missing>'}`);
  console.log(`Probe key: ${probeKey ?? '<none>'}`);
  console.log(`Probe version: ${probeVersion ?? '<sdk default>'}`);
  console.log(`Probe txSeq: ${probeTxSeq ?? '<none>'}`);
  console.log('');
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
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

function readArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function readPositiveInteger(value, fallback) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isBytes32(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

async function readValueWithRetry(client, streamId, encodedKey, version, options) {
  const startedAt = Date.now();

  while (true) {
    const value = await withTimeout(
      client.getValue(streamId, encodedKey, version),
      10_000,
      'KV read did not respond within 10000ms.',
    );

    if (value === null || value.data !== '') {
      return value;
    }

    if (Date.now() - startedAt >= options.readRetryTimeoutMs) {
      return value;
    }

    console.log('Probe read returned an empty value; waiting for read visibility...');
    await delay(options.readRetryIntervalMs);
  }
}

function printDocumentShape(decoded) {
  if (decoded === '') {
    return;
  }

  try {
    const document = JSON.parse(decoded);
    console.log(`Decoded JSON kind: ${typeof document.kind === 'string' ? document.kind : '<missing>'}`);
    if (typeof document.agentId === 'string') {
      console.log(`Decoded JSON agentId: ${document.agentId}`);
    }
  } catch {
    console.log('Decoded JSON: invalid');
  }
}

async function withTimeout(promise, ms, message) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function formatJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatError(error) {
  if (error instanceof Error) {
    const code = 'code' in error ? ` code=${error.code}` : '';
    return `${error.message}${code}`;
  }

  return String(error);
}
