# @0xagentio/sdk

Primary TypeScript SDK for proof-carrying autonomous agents.

Use this package to compose an agent runtime with identity, credential, policy, reasoning, proof generation, storage, execution, and optional peer messaging.

```ts
import { createAgentRuntime, staticRulesReasoningEngine } from '@0xagentio/sdk';
```

The SDK includes local adapters for tests and examples. Real infrastructure can be connected through provider packages such as `@0xagentio/noir`, `@0xagentio/og`, and `@0xagentio/compute`.

See `docs/SDK.md` and `examples/basic/README.md` in the repository for full walkthroughs.
