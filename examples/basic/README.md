# Basic Examples

Most examples use local or in-memory adapters. They are meant to show the SDK shape before real Noir, 0G, Gensyn AXL or Uniswap adapters are connected. The live adapter examples are explicitly opt-in and write to external systems.

## `getting-started.ts`

Canonical first example.

It shows the unique 0xAgentio flow in one local scenario: a principal delegates bounded authority to Alice, Alice sends Bob a proof-backed quote request, Bob verifies before replying, Alice reasons over the quote, and Alice's runtime validates, proves, stores, and executes the final action through a verifying adapter.

Run it with:

```sh
npm run build
npm run example:getting-started
```

## `llm-reasoning-flow.ts`

Dynamic reasoning demo with a mock LLM client.

Alice asks Bob for verified market context, a mock LLM receives the goal and Bob's quote, the LLM proposes a swap, and Alice's runtime still validates, proves, stores, and executes the action. This shows where 0G Compute, OpenAI, Anthropic, or a local model can plug in later without changing the runtime trust boundary.

Run it with:

```sh
npm run build
npm run example:llm-reasoning
```

## `live-stack.ts`

Full live stack demo.

It compiles and uses the real Noir proof adapter, starts two real local Gensyn AXL node processes, persists Alice runtime state on live 0G KV, sends Alice's real Noir proof over AXL, and has Bob verify the proof/action/policy binding before trusting the message.

Required environment values are the same as `live-adapters.ts`.

Run it with:

```sh
npm run example:live-stack
```

Or, if your AXL binary is at `$HOME/Documents/GitHub/axl/node`:

```sh
npm run example:live-stack:binary
```

## `live-adapters.ts`

Opt-in live adapter composition demo.

It starts two real local Gensyn AXL node processes, runs Alice through `createAgentRuntime(...)` with live 0G KV storage, loads Alice state back from 0G, and sends Bob a summary message over AXL. This writes to 0G and requires local credentials plus an AXL binary.

Required environment values:

```sh
AGENTIO_0G_EVM_RPC=...
AGENTIO_0G_INDEXER_RPC=...
AGENTIO_0G_KV_RPC=...
AGENTIO_0G_PRIVATE_KEY=...
AGENTIO_0G_STREAM_ID=...
AGENTIO_0G_EXPECTED_REPLICA=2
AGENTIO_AXL_NODE_BINARY=/path/to/axl/node
```

Run it with:

```sh
npm run example:live-adapters
```

## `agent-runtime-flow.ts`

High-level agent runtime demo.

It shows the recommended composed API for most applications: `createAgentRuntime(...)`. Alice gets identity, credential, policy, reasoning, proof, storage, execution, and transport adapters in one runtime object. Alice runs one authorized action and then sends Bob a compact execution summary over the local AXL-shaped transport.

Run it with:

```sh
npm run example:runtime
```

## `multi-agent-local-stack.ts`

Milestone 1 local end-to-end demo.

It simulates a principal delegating a constrained treasury rebalance policy to Alice, an autonomous local agent. Alice first proves that she is authorized to request a quote, then asks Bob, a local Uniswap-executor agent, for a correlated quote reply. Bob verifies the quote proof before answering. Alice then reasons over Bob's counter-quote, validates delegation and policy, creates a Noir-shaped proof, and asks Bob to execute. Bob independently verifies Alice's proof before returning a mock execution receipt. Alice stores audit records through 0G-shaped storage and sends a proof-backed result over an AXL-shaped local transport. Carol, a separate auditor/listener agent, uses `carol.onVerifiedMessage(...)` to trust Alice's result and reject spoofed messages without proofs.

Run it with:

```sh
npm run example:local-stack
```

This example prints a human-readable walkthrough as the scenario executes.

## `sdk-flow.ts`

Happy-path public SDK flow.

It shows the intended developer sequence:

```txt
createAgentIdentity
→ createPolicy
→ issueLocalCredential
→ createActionIntent
→ createTrustedAgent
→ startOnce
```

Run it with:

```sh
npm run example:flow
```

## `index.ts`

Validation and execution behavior demo.

It runs three local agents:

- an accepted action that validates, proves and executes;
- a disallowed action that is rejected before proof/execution;
- an over-limit action that is rejected by policy constraints.

Run it with:

```sh
npm run example:basic
```

## `noir-flow.ts`

Noir-shaped proof adapter demo.

It uses the same trusted-agent runtime shape as `sdk-flow.ts`, but swaps `localPolicyProofs()` for `localNoirProofs()`. This shows that the SDK runtime is proof-adapter-agnostic before real Noir tooling is connected.

Run it with:

```sh
npm run example:noir
```

## `og-storage-flow.ts`

0G-shaped storage adapter demo.

It uses the same trusted-agent runtime shape as `noir-flow.ts`, but swaps `localMemoryStorage()` for `localOgStorage()`. This shows that the SDK runtime is storage-adapter-agnostic before real 0G Storage is connected.

Run it with:

```sh
npm run example:og
```

## `delegation-gate.ts`

Delegation verification demo.

It runs the same action twice with runtime delegation verification enabled:

- an unsigned credential is rejected before reasoning can lead to proof/execution;
- a locally signed credential is accepted and can execute.

Run it with:

```sh
npm run example:delegation
```

## `axl-message.ts`

Gensyn AXL-shaped peer messaging demo.

It uses the same verified-message flow as `peer-message.ts`, but swaps `localTransport()` for `localAxlTransport()`. This shows proof-backed messages wrapped in local AXL-shaped envelopes before real Gensyn AXL is connected.

Run it with:

```sh
npm run example:axl
```

## `peer-message.ts`

Proof-backed peer messaging demo.

It shows how a receiver can use `onVerifiedMessage` so app logic only handles messages that carry a valid proof. This is the local version of the flow that will later use Gensyn AXL as the transport.

Run it with:

```sh
npm run example:peer
```
