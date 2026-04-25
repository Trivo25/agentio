# 0xAgentio: Trust Layer for Autonomous Agents

## One-Liner

An open framework that gives AI agents verifiable identity and trusted peer-to-peer collaboration — so they can prove who authorized them, discover credentialed peers and coordinate without a central broker, all without revealing who or what is behind them.

## The Problem

AI agents are becoming economic actors. Trading, paying for compute or settling API calls. But they have no portable and verifiable identity. Today, an agent either operates with full transparency (leaking the principal's identity and strategy) or with no accountability (a black box that counterparties can't trust or rely on).

a16z calls this the "Know Your Agent" gap: agents need credentials linking them to their principal, constraints and liability — but existing approaches force a binary choice between privacy and trust.

ZK proofs break this tradeoff.

## The Solution

### The Framework: 0xAgentio

0xAgentio is a trust layer built on two primitives:

**Primitive 1: Verifiable Identity**

Agents carry ZK credentials: Zero-knowledge proofs that attest to their authorization, budget bounds and policy compliance without revealing private inputs. A developer imports the SDK, defines a policy and their agent can generate and present proofs. The framework handles:

- **Credential issuance**: A principal defines policy constraints -> signs delegation to agent -> agent holds private credential
- **Proof generation**: Subsecond proofs attesting to authorization + budget bounds + policy compliance
- **Verification**: Off-chain (peer to peer) or on-chain (auto-generated Solidity verifier on any EVM chain)
- **Onchain registry**: Solidity contracts on 0G Chain for credential commitment, revocation and event logs
- **Persistent state**: 0G Storage for credential state, cumulative spend tracking and audit/interaction trails

What the credential proves (without revealing the private inputs):

- "I was delegated by a valid principal" (without revealing who)
- "This action is within my per-tx limit AND my cumulative spend is within total budget" (without revealing the exact numbers)
- "My actions match a signed policy hash" (auditable without being readable)
