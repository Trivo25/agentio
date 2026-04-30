import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createActionIntent } from './action.js';
import { createAgentIdentity } from './identity.js';
import { createPolicy } from './policy.js';
import {
  staticReasoningEngine,
  staticRulesReasoningEngine,
} from './static-reasoning-engine.js';

const context = {
  identity: createAgentIdentity({
    id: 'agent-static-rules',
    publicKey: 'agent-public-key-static-rules',
  }),
  policy: createPolicy({
    id: 'policy-static-rules',
    allowedActions: ['inspect-config', 'call-api'],
    constraints: [],
    expiresAt: new Date('2026-05-01T00:00:00.000Z'),
  }),
  state: {
    cumulativeSpend: 0n,
    updatedAt: new Date('2026-04-30T00:00:00.000Z'),
  },
  now: new Date('2026-04-30T12:00:00.000Z'),
};

test('staticReasoningEngine returns the same decision every time', async () => {
  const action = createActionIntent({
    type: 'inspect-config',
    metadata: { path: 'agentio.config.json' },
  });
  const reasoning = staticReasoningEngine(action);

  assert.deepEqual(await reasoning.decide(context), action);
  assert.deepEqual(await reasoning.decide(context), action);
});

test('staticRulesReasoningEngine returns the first matching rule decision', async () => {
  const action = createActionIntent({
    type: 'inspect-config',
    metadata: { path: 'agentio.config.json' },
  });
  const reasoning = staticRulesReasoningEngine({
    rules: [
      () => undefined,
      ({ identity }) =>
        identity.id === 'agent-static-rules' ? action : undefined,
      () => createActionIntent({ type: 'call-api' }),
    ],
  });

  assert.deepEqual(await reasoning.decide(context), action);
});

test('staticRulesReasoningEngine supports async rules and explicit skip decisions', async () => {
  const reasoning = staticRulesReasoningEngine({
    rules: [
      async ({ state }) => {
        await Promise.resolve();
        return state.cumulativeSpend === 0n ? 'skip' : undefined;
      },
      () => createActionIntent({ type: 'call-api' }),
    ],
  });

  assert.equal(await reasoning.decide(context), 'skip');
});

test('staticRulesReasoningEngine uses fallback when no rule matches', async () => {
  const fallback = createActionIntent({
    type: 'call-api',
    metadata: { endpoint: 'https://example.invalid/status' },
  });
  const reasoning = staticRulesReasoningEngine({
    rules: [() => undefined],
    fallback,
  });

  assert.deepEqual(await reasoning.decide(context), fallback);
});

test('staticRulesReasoningEngine skips by default when no rule matches', async () => {
  const reasoning = staticRulesReasoningEngine({
    rules: [() => undefined],
  });

  assert.equal(await reasoning.decide(context), 'skip');
});
