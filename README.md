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

**Primitive 2: Trusted P2P Collaboration**

Credentials itself are only static pieces of data — they need a communication layer to become useful. The `axl` adapter turns AXL into a trust network where agents discover, verify and collaborate with credentialed peers:

- **Credential-gated peer discovery**: An agent announces its capabilities and credential on the mesh. Other agents discover it, verify the credential and initiate collaboration. No marketplace or directory needed. The mesh itself _is_ the marketplace!
- **Trust-weighted signals**: Agents broadcast information (market signals, research findings, task results) with their credential attached. Receiving agents verify the senders credential before trusting the signal and weight it by the sender's proven authorization level. An agent with a 50$ budget carries more signal weight than one with $10 and you can't fake it.
- **Mutual verification handshakes**: Before two agents transact bilaterally, they exchange credentials over AXL. Both sides verify the other is authorized before proceeding. Neither side needs to know who the others principal is - just that they're credentialed.
- **Transport-layer filtering**: Unverified signals are dropped at the transport layer before reaching the application. The `axl` adapter is opinionated - if you can't prove who you are, your messages don't get through.
- **Instant trust, no reputation needed**: Multi-agent systems need reputation scores that take time to build and are gameable. With 0xAgentio, trust is instant: a brand-new agent with a valid credential is immediately trustworthy on its first interaction because the proof _is_ the reputation.

### Where 0xAgentio Applies

The framework is domain agnostic. The same identity + collaboration stack applies anywhere agents need to prove who they are, discover peers and coordinate work:

- **Data marketplace via mesh discovery**: A research agent announces on the AXL mesh: "I'm authorized by a biotech firm with a $10K data procurement budget, scoped to genomics datasets only." Data provider agents discover it, verify the credential and offer their datasets. No marketplace platform is needed: the mesh is the marketplace. The buyer proves budget and scope in ZK; the seller verifies before granting access.

- **Compute delegation**: A principal authorizes an agent to spend up to $X on GPU inference across decentralized compute providers. The agent discovers providers on the mesh, presents its budget credential and providers verify before accepting jobs. Multiple agents from the same principal can coordinate task splitting - each proving their individual budgets roll up to the same delegation.

- **Multi-agent task coordination**: A swarm of specialist agents (planner, researcher, executor, auditor) collaborate on a complex task. Each agent's credential proves its role and scope — the executor can commit up to $Y of resources, the auditor has read-only access to all execution logs. Agents verify each other's credentials over AXL before sharing work artifacts. The planner only accepts results from agents whose credentials prove the right scope.

- **API access gating**: An agent acts as an intermediary consuming third-party APIs on behalf of users. The credential proves the agent is rate-limited (max N calls/hour) and scoped to specific endpoints, without revealing which user delegated it. API providers verify the credential instead of issuing API keys to anonymous bots.

The common pattern: a principal delegates bounded authority -> the agent proves its bounds in ZK -> the agent discovers and collaborates with verified peers over AXL -> counterparties verify the proof before interacting. 0xAgentio is the trust layer that makes all of this work without a central authority.

### The Demo App: 0xAgentio-Trade

A multi-agent DCA trading system built on the framework. Agents autonomously trade on Uniswap within credential-enforced budget envelopes and share Sybil-resistant market signals over AXL. This demonstrates the framework in action and targets the Uniswap prize track.
