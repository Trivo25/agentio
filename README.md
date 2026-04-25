# KYA-ZK: Zero-Knowledge Credentials And Proven Interaction Layer for Autonomous Agents

## One-Liner

Agents prove who authorized them, what they're allowed to do, and that they're playing by the rules, without revealing who's behind them or leaking their intentions or strategies.

## The Problem

AI agents are becoming economic actors. They are trading, paying for compute and settling API calls. But they have no portable, verifiable identity. Today, an agent either operates with full transparency (leaking the principal's identity and strategy) or with no accountability (a black box that counterparties can't trust orr rely on).

a16z calls this the "Know Your Agent" gap: agents need credentials linking them to their principal, constraints and liability, but existing approaches force a binary choice between privacy and trust.

Zero-knowledge proofs break this tradeoff.

## The Solution

Agentio is an onchain credential system where agents carry zero-knowledge proofs attesting to:

- **Authorization**: "I was delegated by a valid principal" (without revealing who)
- **Budget envelope**: "This trade is within my per-tx limit AND my cumulative spend is within total budget" (without revealing the exact numbers)
- **Policy compliance**: "My actions match a signed policy hash" (auditable without being readable)

Agents present these credentials peer-to-peer when trading and when sharing market signals. A signal from a credentialed agent with proven skin in the game is worth something whereas a signal or request from an anonymous bot is noise.
