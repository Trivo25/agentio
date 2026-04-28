#!/usr/bin/env node
import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const count = readCount(args);
const asJson = args.includes('--json');
const asEnv = args.includes('--env');
const streamIds = Array.from({ length: count }, (_, index) => ({
  index: index + 1,
  streamId: `0x${randomBytes(32).toString('hex')}`,
}));

if (asJson) {
  console.log(JSON.stringify(streamIds, null, 2));
} else if (asEnv) {
  printEnv(streamIds);
} else {
  printHuman(streamIds);
}

function readCount(values) {
  const rawCount = values.find((value) => /^\d+$/.test(value));
  if (rawCount === undefined) {
    return 1;
  }

  const parsed = Number.parseInt(rawCount, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new Error('Stream id count must be between 1 and 50.');
  }

  return parsed;
}

function printHuman(ids) {
  console.log('Generated 0G KV stream id(s). Use one with a funded writer key for live storage tests.');
  console.log('');

  for (const id of ids) {
    console.log(`Stream ${id.index}`);
    console.log(`  Stream id: ${id.streamId}`);
    console.log('');
  }

  if (ids[0] !== undefined) {
    console.log('For the 0G live smoke test, set:');
    console.log(`AGENTIO_0G_STREAM_ID=${ids[0].streamId}`);
  }
}

function printEnv(ids) {
  for (const id of ids) {
    const suffix = ids.length === 1 ? '' : `_${id.index}`;
    console.log(`TEST_0G_STREAM_ID${suffix}=${id.streamId}`);
  }

  if (ids[0] !== undefined) {
    console.log(`AGENTIO_0G_STREAM_ID=${ids[0].streamId}`);
  }
}
