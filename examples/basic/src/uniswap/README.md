# Uniswap Track Example

## quickstart

From a fresh checkout:

```sh
npm install
npm run build
```

Run the safe Uniswap demo:

```sh
npm run example:uniswap:judge-demo
```

This runs the full proof-gated flow locally. It does not require a Uniswap API key and it does not submit transactions. It shows Alice creating proof-backed Uniswap requests and Bob verifying those requests before preparing Uniswap API work.

Run the web UI:

```sh
npm run example:uniswap:web-ui
```

Then open the printed local URL, usually:

```txt
http://127.0.0.1:4173/uniswap-demo.html
```

To call the live Uniswap approval-check and quote endpoints, add an API key:

```sh
AGENTIO_UNISWAP_API_KEY=your_key \
AGENTIO_UNISWAP_RUN_LIVE_API=1 \
npm run example:uniswap:judge-demo
```

The live mode only calls `POST /check_approval` and `POST /quote`. Swap and UniswapX order submission stay disabled unless separate live flags and signatures are configured. For judging, I recommend keeping swap and order submission disabled.

Useful files:

- `examples/basic/src/uniswap-live-quote.ts` - executable console demo.
- `landing/uniswap-demo.html` - static web UI walkthrough.
- `docs/UNISWAP-EXAMPLE.md` - technical explanation of the example.
- `FEEDBACK.md` - required Uniswap builder feedback.

The Uniswap-focused local demo is:

```sh
npm run build
npm run example:uniswap:local
```

The live API preparation demo is:

```sh
npm run example:uniswap:quote-live
```

By default, the demo verifies Alice's proof and prepares Uniswap
`POST /check_approval`, `POST /quote`, `POST /swap`, and `POST /order` request
shapes without calling the network. To submit the real approval-check and quote
requests, provide an API key and explicitly opt in:

```sh
AGENTIO_UNISWAP_API_KEY=your_key \
AGENTIO_UNISWAP_RUN_LIVE_API=1 \
npm run example:uniswap:quote-live
```

`AGENTIO_UNISWAP_RUN_LIVE_QUOTE=1` is still accepted as a compatibility alias.
`POST /swap` is still prepared-only unless `AGENTIO_UNISWAP_RUN_LIVE_SWAP=1`
is set, because live swap preparation may require a Permit2 signature from the
current quote.
`POST /order` is also prepared-only unless `AGENTIO_UNISWAP_RUN_LIVE_ORDER=1`
is set, because a signed UniswapX order can become fillable once accepted by the
filler network.

## demo commands

Run the executable console walkthrough with:

```sh
npm run example:uniswap:judge-demo
```

Run the static web UI locally with:

```sh
npm run example:uniswap:web-ui
```

The web UI mirrors the same trust boundary as the TypeScript example: Alice sends
proof-backed Uniswap requests, Bob verifies before preparing API work, and swap
or order submission remains disabled unless explicit live flags and signatures
are configured.

## What it demonstrates

This is not just a generic 0xAgentio example with a Uniswap label. It models the Uniswap integration as a proof-gated gateway agent:

```txt
Alice treasury agent
-> sends proof-backed quote request
-> Bob Uniswap gateway verifies before doing quote work
-> Bob returns a Uniswap-shaped quote
-> Alice reasons over quote quality
-> Alice sends proof-backed swap request
-> Bob verifies again before mock execution
-> Alice state and audit are persisted
```

The example includes two negative paths: Mallory sends an unproved quote request and Bob rejects it before doing any Uniswap work; then a valid proof is reused with a tampered swap amount and Bob rejects it because the proof no longer matches the action hash.

## Why this matters for a Uniswap track

A real Uniswap Trading API integration has valuable boundaries before execution:

- quote access can consume API capacity and reveal strategy;
- Permit2/swap preparation should be tied to the correct user intent;
- final execution should be checked against delegated policy, quote id, route, amount, and slippage constraints;
- downstream services should not trust an autonomous agent just because it asks nicely.

0xAgentio adds proof-carrying requests around those boundaries. Bob can verify Alice's authority before quoting or executing, while Alice's runtime still persists state and audit records after accepted actions.

## Local now,

The current demo is intentionally local and CI-safe:

**BUT** given 0xAgentiosn modular nature, the following parts can be swapped out for real infrastructure very quickly (see the other full-stack examples). Specifically for AXL, it's easier to mock it as the user won't have to set up local AXL binaries or configure network settings. Same goes for the storage (currently memory-only, but live adapters exist in the project).

- `localNoirProofs()` stands in for Noir proofs;
- `localOgStorage()` stands in for 0G state/audit persistence;
- `localAxlTransport()` stands in for AXL messaging;
- Bob returns a mock quote shaped like the Uniswap Trading API flow.

The live API preparation demo covers the first real API boundaries:

```txt
Bob verifies Alice's proof
-> Bob calls Uniswap Trading API /check_approval
-> Bob returns whether approval or cancel calldata would be needed
-> Alice sends a separately proof-backed quote request
-> Bob verifies Alice's proof again
-> Bob calls Uniswap Trading API /quote
-> Bob returns the real quote
-> Alice sends a separately proof-backed swap preparation request
-> Bob verifies Alice's proof again
-> Bob prepares Uniswap Trading API /swap request shape
-> Bob validates returned swap calldata when live /swap is enabled
-> Alice sends a separately proof-backed UniswapX order preparation request
-> Bob verifies Alice's proof again
-> Bob prepares Uniswap Trading API /order request shape
-> Bob requires a real signature before live /order submission
-> no transaction is submitted
```

Only after approval, quote, swap, and order preparation are clean should we add wallet signing and transaction broadcasting, because those are the first irreversible execution steps.

The live example follows the official Uniswap Trading API shape:

- `POST https://trade-api.gateway.uniswap.org/v1/check_approval`
- `POST https://trade-api.gateway.uniswap.org/v1/quote`
- `POST https://trade-api.gateway.uniswap.org/v1/swap`
- `POST https://trade-api.gateway.uniswap.org/v1/order`
- required `x-api-key` header;
- `x-universal-router-version` kept consistent for the swap journey;
- optional `x-permit2-disabled` and `x-erc20eth-enabled` headers;
- `check_approval` request with wallet address, token, amount, chain id, optional output token, and gas-info flag;
- `EXACT_INPUT` quote request with token addresses, chain ids, amount, swapper, slippage, protocols, and routing preference;
- `/swap` request with the quote object, optional Permit2 signature and permit data, gas refresh, safety mode, and deadline;
- `/order` request with a UniswapX quote and signed permit for `DUTCH_V2`, `DUTCH_V3`, `LIMIT_ORDER`, or `PRIORITY` routes.
