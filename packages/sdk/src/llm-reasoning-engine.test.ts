import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createAgentIdentity } from './identity.js';
import { llmReasoningEngine, parseLlmReasoningDecision } from './llm-reasoning-engine.js';
import { mockLlmClient } from './llm-client.js';
import { createPolicy } from './policy.js';

const context = {
  identity: createAgentIdentity({
    id: 'agent-llm',
    publicKey: 'agent-public-key-llm',
  }),
  policy: createPolicy({
    id: 'policy-llm',
    allowedActions: ['swap', 'request-quote'],
    constraints: [{ type: 'max-amount', value: 500n }],
    expiresAt: new Date('2026-05-01T00:00:00.000Z'),
  }),
  state: {
    cumulativeSpend: 125n,
    updatedAt: new Date('2026-04-30T00:00:00.000Z'),
  },
  now: new Date('2026-04-30T12:00:00.000Z'),
};

test('llmReasoningEngine sends goal, policy, state, and JSON instructions to the client', async () => {
  let prompt = '';
  const reasoning = llmReasoningEngine({
    client: mockLlmClient((request) => {
      assert.equal(request.responseFormat, 'json');
      assert.match(request.system ?? '', /strict JSON/);
      prompt = request.messages[0]?.content ?? '';
      return JSON.stringify({
        decision: 'act',
        action: {
          type: 'swap',
          amount: '250',
          metadata: { assetPair: 'ETH/USDC' },
        },
      });
    }),
    goal: 'rebalance if quote is acceptable',
    allowedActionTypes: ['swap'],
  });

  const action = await reasoning.decide(context);

  assert.equal(action !== 'skip' ? action.type : undefined, 'swap');
  assert.equal(action !== 'skip' ? action.amount : undefined, 250n);
  assert.match(prompt, /rebalance if quote is acceptable/);
  assert.match(prompt, /policy-llm/);
  assert.match(prompt, /125/);
});

test('llmReasoningEngine returns skip when the model skips', async () => {
  const reasoning = llmReasoningEngine({
    client: mockLlmClient(() =>
      JSON.stringify({ decision: 'skip', reason: 'no quote available' }),
    ),
    goal: 'rebalance if quote is acceptable',
  });

  assert.equal(await reasoning.decide(context), 'skip');
});

test('llmReasoningEngine rejects action types outside the configured allow-list', async () => {
  const reasoning = llmReasoningEngine({
    client: mockLlmClient(() =>
      JSON.stringify({
        decision: 'act',
        action: { type: 'transfer', amount: '1' },
      }),
    ),
    goal: 'rebalance if quote is acceptable',
    allowedActionTypes: ['swap'],
  });

  await assert.rejects(
    () => reasoning.decide(context),
    /disallowed action type transfer/,
  );
});

test('llmReasoningEngine lets guards skip an otherwise valid LLM action', async () => {
  const reasoning = llmReasoningEngine({
    client: mockLlmClient(() =>
      JSON.stringify({
        decision: 'act',
        action: {
          type: 'swap',
          amount: '250',
          metadata: { assetPair: 'ETH/USDC' },
        },
      }),
    ),
    goal: 'rebalance if quote is acceptable',
    guard: async ({ decision, context: guardContext }) => {
      assert.equal(decision.decision, 'act');
      assert.equal(guardContext.identity.id, 'agent-llm');
      return 'skip' as const;
    },
  });

  assert.equal(await reasoning.decide(context), 'skip');
});

test('llmReasoningEngine lets guards rewrite LLM actions before runtime validation', async () => {
  const reasoning = llmReasoningEngine({
    client: mockLlmClient(() =>
      JSON.stringify({
        decision: 'act',
        action: {
          type: 'swap',
          amount: '999',
          metadata: { assetPair: 'ETH/USDC' },
        },
      }),
    ),
    goal: 'rebalance if quote is acceptable',
    allowedActionTypes: ['swap'],
    guard: ({ decision }) => {
      if (decision.decision === 'skip') {
        return decision;
      }

      return {
        ...decision,
        action: {
          ...decision.action,
          amount: 250n,
          metadata: {
            ...decision.action.metadata,
            guarded: true,
          },
        },
      };
    },
  });

  const action = await reasoning.decide(context);

  assert.notEqual(action, 'skip');
  if (action === 'skip') {
    throw new Error('Expected guard to return an action.');
  }
  assert.equal(action.amount, 250n);
  assert.deepEqual(action.metadata, {
    assetPair: 'ETH/USDC',
    guarded: true,
  });
});

test('parseLlmReasoningDecision requires strict JSON object output', () => {
  assert.throws(
    () => parseLlmReasoningDecision('The answer is swap.'),
    /strict JSON/,
  );
  assert.throws(
    () => parseLlmReasoningDecision('[]'),
    /JSON object/,
  );
});

test('parseLlmReasoningDecision accepts integer number amounts from providers', () => {
  const decision = parseLlmReasoningDecision(
    JSON.stringify({
      decision: 'act',
      action: { type: 'swap', amount: 250 },
    }),
  );

  assert.equal(decision.decision, 'act');
  assert.equal(decision.action.amount, 250n);
});

test('parseLlmReasoningDecision accepts integer-looking amount strings from providers', () => {
  const decision = parseLlmReasoningDecision(
    JSON.stringify({
      decision: 'act',
      action: { type: 'swap', amount: ' 250.0 ' },
    }),
  );

  assert.equal(decision.decision, 'act');
  assert.equal(decision.action.amount, 250n);
});

test('parseLlmReasoningDecision rejects unsafe or fractional number amounts', () => {
  assert.throws(
    () =>
      parseLlmReasoningDecision(
        JSON.stringify({
          decision: 'act',
          action: { type: 'swap', amount: 1.5 },
        }),
      ),
    /decimal string or safe integer/,
  );
  assert.throws(
    () =>
      parseLlmReasoningDecision(
        JSON.stringify({
          decision: 'act',
          action: { type: 'swap', amount: Number.MAX_SAFE_INTEGER + 1 },
        }),
      ),
    /decimal string or safe integer/,
  );
});

test('parseLlmReasoningDecision parses action metadata and optional reason', () => {
  const decision = parseLlmReasoningDecision(
    JSON.stringify({
      decision: 'act',
      action: {
        type: 'request-quote',
        amount: '10',
        metadata: { venue: 'uniswap-demo' },
      },
      reason: 'need market data',
    }),
  );

  assert.equal(decision.decision, 'act');
  assert.equal(decision.reason, 'need market data');
  assert.equal(decision.action.type, 'request-quote');
  assert.equal(decision.action.amount, 10n);
  assert.deepEqual(decision.action.metadata, { venue: 'uniswap-demo' });
});
