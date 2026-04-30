import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  ZERO_G_COMPUTE_ROUTER_TESTNET_BASE_URL,
  createZeroGComputeRouterChatCompletionBody,
  zeroGComputeRouterLlmClient,
  type ZeroGComputeRouterFetch,
} from './router-client.js';

test('createZeroGComputeRouterChatCompletionBody maps SDK requests to 0G Router chat completions', () => {
  const body = createZeroGComputeRouterChatCompletionBody(
    {
      system: 'Return JSON only.',
      responseFormat: 'json',
      messages: [{ role: 'user', content: 'Decide next action.' }],
    },
    { model: 'zai-org/GLM-5-FP8' },
  );

  assert.deepEqual(body, {
    model: 'zai-org/GLM-5-FP8',
    messages: [
      { role: 'system', content: 'Return JSON only.' },
      { role: 'user', content: 'Decide next action.' },
    ],
    response_format: { type: 'json_object' },
  });
});

test('createZeroGComputeRouterChatCompletionBody can omit provider JSON mode', () => {
  const body = createZeroGComputeRouterChatCompletionBody(
    {
      responseFormat: 'json',
      messages: [{ role: 'user', content: 'Decide next action.' }],
    },
    {
      model: 'zai-org/GLM-5-FP8',
      responseFormatStrategy: 'prompt-only',
    },
  );

  assert.deepEqual(body, {
    model: 'zai-org/GLM-5-FP8',
    messages: [{ role: 'user', content: 'Decide next action.' }],
  });
});

test('zeroGComputeRouterLlmClient sends authorized requests and normalizes responses', async () => {
  let requestUrl = '';
  let requestHeaders: Readonly<Record<string, string>> = {};
  let requestBody: unknown;
  const fetch: ZeroGComputeRouterFetch = async (input, init) => {
    requestUrl = input;
    requestHeaders = init.headers;
    requestBody = JSON.parse(init.body) as unknown;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      async json() {
        return {
          id: 'chatcmpl-test',
          model: 'zai-org/GLM-5-FP8',
          choices: [
            {
              message: {
                content: '{"decision":"skip","reason":"test"}',
              },
            },
          ],
          usage: { total_tokens: 42 },
        };
      },
      async text() {
        return '';
      },
    };
  };
  const client = zeroGComputeRouterLlmClient({
    apiKey: 'sk-test',
    model: 'zai-org/GLM-5-FP8',
    fetch,
    headers: { 'X-AgentIO-Test': '1' },
  });

  const result = await client.complete({
    responseFormat: 'json',
    messages: [{ role: 'user', content: 'hello' }],
  });

  assert.equal(
    requestUrl,
    `${ZERO_G_COMPUTE_ROUTER_TESTNET_BASE_URL}/chat/completions`,
  );
  assert.equal(requestHeaders.Authorization, 'Bearer sk-test');
  assert.equal(requestHeaders['X-AgentIO-Test'], '1');
  assert.deepEqual(requestBody, {
    model: 'zai-org/GLM-5-FP8',
    messages: [{ role: 'user', content: 'hello' }],
    response_format: { type: 'json_object' },
  });
  assert.deepEqual(result, {
    content: '{"decision":"skip","reason":"test"}',
    model: 'zai-org/GLM-5-FP8',
    metadata: {
      id: 'chatcmpl-test',
      usage: { total_tokens: 42 },
    },
  });
});

test('zeroGComputeRouterLlmClient surfaces router errors with response body', async () => {
  const fetch: ZeroGComputeRouterFetch = async () => ({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    async json() {
      return {};
    },
    async text() {
      return '{"error":"bad key"}';
    },
  });
  const client = zeroGComputeRouterLlmClient({
    apiKey: 'sk-test',
    model: 'zai-org/GLM-5-FP8',
    fetch,
  });

  await assert.rejects(
    () =>
      client.complete({
        messages: [{ role: 'user', content: 'hello' }],
      }),
    /401 Unauthorized.*bad key/,
  );
});

test('zeroGComputeRouterLlmClient rejects malformed router responses', async () => {
  const fetch: ZeroGComputeRouterFetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    async json() {
      return { choices: [] };
    },
    async text() {
      return '';
    },
  });
  const client = zeroGComputeRouterLlmClient({
    apiKey: 'sk-test',
    model: 'zai-org/GLM-5-FP8',
    fetch,
  });

  await assert.rejects(
    () =>
      client.complete({
        messages: [{ role: 'user', content: 'hello' }],
      }),
    /did not include choices/,
  );
});
