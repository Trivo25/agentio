import assert from 'node:assert/strict';
import test from 'node:test';

import { createOgProgressLogger, formatOgProgressMessage } from './progress.js';

test('formatOgProgressMessage keeps level 0 minimal', () => {
  assert.equal(formatOgProgressMessage('0G KV write preparing stream=s key=k encodedKey=a bytes=10', 0), undefined);
  assert.deepEqual(formatOgProgressMessage('Upload finalized.', 0), { message: '[0G] upload finalized' });
  assert.deepEqual(
    formatOgProgressMessage('0G KV write completed txHash=0xabc rootHash=0xdef txSeq=42', 0),
    { message: '[0G] write complete: txSeq=42, txHash=0xabc' },
  );
});

test('formatOgProgressMessage summarizes useful level 1 progress', () => {
  assert.deepEqual(
    formatOgProgressMessage('0G KV write preparing stream=0x1 key=agents/alice/state/latest encodedKey=x bytes=234', 1),
    { message: '[0G] write: agents/alice/state/latest (234 bytes)' },
  );
  assert.deepEqual(
    formatOgProgressMessage('0G KV selected storage nodes: http://one, http://two', 1),
    { message: '[0G] storage replicas: 2 selected' },
  );
  assert.deepEqual(
    formatOgProgressMessage('0G KV returned an empty value; waiting for read visibility...', 1),
    { message: '[0G] read: waiting for KV read visibility...', once: true },
  );
});

test('formatOgProgressMessage forwards raw verbose progress', () => {
  assert.deepEqual(formatOgProgressMessage('raw sdk detail', 'verbose'), { message: '[0G] raw sdk detail' });
});

test('createOgProgressLogger suppresses repeat once messages', () => {
  const messages: string[] = [];
  const logger = createOgProgressLogger({ level: 1, log: (message) => messages.push(message) });

  logger('0G KV returned an empty value; waiting for read visibility...');
  logger('0G KV returned an empty value; waiting for read visibility...');
  logger('Upload finalized.');

  assert.deepEqual(messages, [
    '[0G] read: waiting for KV read visibility...',
    '[0G] upload: finalized',
  ]);
});
