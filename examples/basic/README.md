# Basic Example Sketch

This example will become the smallest developer-facing 0xAgentio flow.

Target shape:

```ts
const agent = await createTrustedAgent({
  identity,
  credential,
  policy,
  state,
  reasoning: dcaReasoningEngine({
    actionType: 'swap',
    amount: 250n,
    assetPair: 'ETH/USDC',
  }),
  proof: localPolicyProofs(),
  storage: localMemoryStorage(),
});

const result = await agent.startOnce();
```

The first runnable version should prove this local flow only:

```txt
reasoning proposes action
→ policy validation accepts or rejects it
→ local proof adapter returns proof-shaped output
→ local storage records an audit event
```

No Noir, 0G, AXL, Uniswap, or LLM integration belongs in this first example.
