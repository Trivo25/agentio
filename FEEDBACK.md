# Uniswap API and Developer Platform Feedback

This file is required for the Uniswap hackathon submission.

## Project context

I am building a proof-carrying autonomous agent flow for Uniswap:

```txt
Alice agent proposes quote/swap intent
-> 0xAgentio validates delegated policy
-> 0xAgentio generates an authorization proof
-> Bob Uniswap gateway verifies the proof
-> Bob calls the Uniswap API for approval/quote/swap/order work
-> Alice persists state and audit data
```

The goal is to make Uniswap API usage safer for agentic finance. Before an autonomous agent can ask a gateway, wallet or service to prepare execution, the receiving agent verifies that the request matches delegated authority. In our demo, Bob only prepares or calls Uniswap endpoints after verifying Alice's proof-backed request.

## Uniswap resources used

- Uniswap Developer docs https://developers.uniswap.org/docs
- Trading overview https://developers.uniswap.org/docs/trading/overview
- Swapping via the Uniswap API https://developers.uniswap.org/docs/trading/swapping-api/getting-started
- Swapping API integration guide https://developers.uniswap.org/docs/trading/swapping-api/integration-guide
- Check approval API reference https://developers.uniswap.org/docs/api-reference/check_approval
- Quote API reference https://developers.uniswap.org/docs/api-reference/aggregator_quote
- Swap API reference https://developers.uniswap.org/docs/api-reference/create_swap_transaction
- Order API reference https://developers.uniswap.org/docs/api-reference/post_order
- Uniswap AI overview https://developers.uniswap.org/docs/uniswap-ai/overview
- Uniswap AI repo https://github.com/Uniswap/uniswap-ai

## What worked well

- The API surface seems easy enough and maps well to agentic flows
- Setting up the API key and using it is straightforward (suprinsingly that's not always the case with APIs)
- The docs are broad enough to understand the intended

## What did not work well

- none so far

## Bugs or unexpected behavior

- I only had some unexpected behaviour with the `x-universal-router-version` header

```txt
"x-universal-router-version" must be one of [2.0, 2.1.1]
```

## Documentation gaps

- none so far

## DX friction

- none so far
- Happy that there's a CLI but I ended up using curl directly

## Missing endpoints or features we wish existed

- none so far

## Final feedback before submission

Overall the Uniswap API seems to fit _very_ well with the agentic use case I am trying to work on with 0xAgention. The flow is straightforward and the docs are clear. I will update this feedback if I encounter any issues as I build out/finish the demo (and let the team know in case anything pops up after the hackathon too).
