# @0xagentio/compute

0G Compute Router client for AgentIO reasoning.

This package adapts the 0G Compute Router OpenAI-compatible chat completion API to the generic `LlmClient` interface from `@0xagentio/sdk`.

```ts
import { zeroGComputeRouterLlmClient } from '@0xagentio/compute';
```

Use this with `llmReasoningEngine(...)` when 0G Compute should provide the live reasoning layer for an agent.
