# Uniswap API and Developer Platform Feedback

This file is required for the Uniswap hackathon submission

## Project context

I am building a proof-carrying autonomous agent flow for Uniswap:

```txt
Alice agent proposes quote/swap intent
-> AgentIO validates delegated policy->
-> AgentIO generates an authorization proof
-> Bob Uniswap gateway verifies the proof
-> Bob calls the Uniswap API for quote/swap work
-> Alice persists state and audit data
```

The goal is to make Uniswap API usage safer for agentic finance by proving that an autonomous agent is authorized to request a specific quote or swap before a gateway, wallet or service spends work or prepares execution - by using 0xAgention :)

## Uniswap resources used

- Uniswap Developer docs https://developers.uniswap.org/docs
- Trading overview https://developers.uniswap.org/docs/trading/overview
- Swapping via the Uniswap API https://developers.uniswap.org/docs/trading/swapping-api/getting-started
- Uniswap AI overview https://developers.uniswap.org/docs/uniswap-ai/overview
- Uniswap AI repo https://github.com/Uniswap/uniswap-ai

## What worked well

_TBD_

## What did not work well

_TBD_

## Bugs or unexpected behavior

_TBD_

## Documentation gaps

_TBD_

## DX friction

_TBD_

## Missing endpoints or features we wish existed

_TBD_

## Final feedback before submission

_TBD_
