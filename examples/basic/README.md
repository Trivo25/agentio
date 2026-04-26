# Basic Examples

These examples use only local in-memory adapters. They are meant to show the SDK shape before real Noir, 0G, Gensyn AXL or Uniswap adapters are connected.

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

## `delegation-gate.ts`

Delegation verification demo.

It runs the same action twice with runtime delegation verification enabled:

- an unsigned credential is rejected before reasoning can lead to proof/execution;
- a locally signed credential is accepted and can execute.

Run it with:

```sh
npm run example:delegation
```

## `peer-message.ts`

Proof-backed peer messaging demo.

It shows how a receiver can use `onVerifiedMessage` so app logic only handles messages that carry a valid proof. This is the local version of the flow that will later use Gensyn AXL as the transport.

Run it with:

```sh
npm run example:peer
```
