# What Is an Agent in 0xAgentio?

In 0xAgentio, an **agent** is the autonomous software actor that has been delegated bounded authority by a human, organization, DAO, wallet or other principal.

It is **not just an LLM**. An LLM may be part of the agent, but the agent is the whole operating unit: identity, credential, policy, state, decision loop, communication and execution tools.

---

## Short definition

> An agent is a credentialed autonomous program that can prove it is authorized to act, communicate with other agents and execute actions within a delegated policy envelope.

---

## Agent anatomy

```txt
Agent
├── identity
│   └── agent keypair or public key
├── credential
│   └── proof that a principal delegated bounded authority
├── policy
│   └── what the agent is allowed to do
├── state
│   └── cumulative spend, memory, history, audit trail
├── decision logic
│   └── rules, strategy, planner or LLM reasoning
├── communication
│   └── Gensyn AXL node / transport adapter
└── execution adapters
    └── Uniswap API, 0G Storage, contracts, tools, external APIs
```

The agent is the runtime process that combines these pieces.

---

## Principal vs agent vs verifier

```txt
Principal / Human / Organization
        │
        │ signs delegation
        ▼
Agent
        │
        │ acts within credential policy
        ▼
External systems / peers / protocols
```

### Principal

The principal is the entity that authorizes the agent.

Examples:

- human wallet owner
- DAO
- company
- trading desk
- application user
- another higher-level coordinator agent

The principal defines the policy and signs the delegation.

### Agent

The agent is the software actor that operates under that delegation.

Examples:

- trading agent
- research agent
- compute buyer agent
- data seller agent
- moderation agent
- coordinator agent

### Verifier

The verifier is a peer, service, contract, or another agent that checks whether a credential/proof is valid before trusting the agent or allowing an action.

A verifier can be implemented as a standalone service or as another 0xAgentio agent.

## Where an LLM fits

An LLM belongs in the **decision layer**, not the trust layer.

```txt
┌──────────────────────────────┐
│ Agent runtime                │
│                              │
│  Identity + credential       │  ← required
│  Policy + proof generation   │  ← required
│  0G state/audit storage      │  ← required for our framework story
│  AXL communication           │  ← required for P2P trust story
│                              │
│  Decision engine             │
│  ├── rules                   │  ← valid MVP
│  ├── strategy function       │  ← valid MVP
│  └── LLM planner/reasoner    │  ← optional enhancement
└──────────────────────────────┘
```

The LLM should never be the source of authority. It can suggest or choose actions, but 0xAgentio still gates those actions through policy checks and ZK proofs.

In other words:

```txt
LLM decides what it wants to do.
0xAgentio proves whether it is allowed to do it.
```
