# 0xAgentio SDK Design

0xAgentio should be designed as a developer-facing trust framework that hides three hard subsystems behind one SDK:

1. **Noir** — proves an agent is authorized without revealing private policy data.
2. **0G** — persists and verifies credential state, audit logs, and onchain registry data.
3. **Gensyn AXL** — lets agents discover each other and exchange credential-backed messages peer-to-peer.

A third-party developer should not feel like they are manually using Noir, 0G, and AXL. They should feel like they are using one agent trust SDK.

---

## Product primitive

The framework primitive is not trading. Trading is only the demo application.

The reusable primitive is:

> **Credential-gated agent interaction.**

The common pattern:

```txt
Principal delegates bounded authority
        ↓
Agent proves authority privately
        ↓
Peers verify proof before interaction
        ↓
State and receipts persist on 0G
        ↓
Communication happens over AXL
```

This can apply to:

- trading agents
- compute agents
- data marketplace agents
- API access agents
- research swarms
- moderation agents
- agent marketplaces

---

## Developer-facing pitch

0xAgentio is an SDK for building trusted autonomous agents. Developers define a private policy, issue a credential to an agent, and the agent can then prove over a P2P network that it is authorized to act — without revealing the principal or full policy. Noir handles the proof, 0G stores and verifies state, and AXL carries credential-gated messages between agents.

The tools are implementation details. The product is the trust layer.

---

## What we provide to developers

The SDK should answer:

> “How do I give my agent a private, verifiable credential and let other agents trust it over a P2P network?”

The framework should expose high-level concepts:

```ts
import {
  createPolicy,
  issueCredential,
  createAgent,
  createTrustNetwork,
} from '@0xagentio/sdk';

const policy = createPolicy({
  agent: agentAddress,
  allowedActions: ['swap:ETH-USDC'],
  maxPerActionUsd: 500,
  totalBudgetUsd: 5_000,
  expiresAt: '2026-05-01T00:00:00Z',
});

const credential = await issueCredential({
  principalSigner,
  policy,
});

const agent = createAgent({
  credential,
  storage: ogStorage(),
  transport: axlTransport(),
});

await agent.broadcastSignal({
  type: 'market-signal',
  pair: 'ETH/USDC',
  direction: 'buy',
  confidence: 0.82,
});
```

The developer should not manually deal with:

- Noir witness formatting
- Barretenberg proof generation details
- 0G Storage upload/log mechanics
- AXL message serialization
- credential verification protocol
- public/private input layout
- audit trail structure

They should import the SDK and get a usable trust layer.

---

## Architecture model

Design the framework as four planes:

```txt
┌────────────────────────────────────────────┐
│ Developer API                              │
│ @0xagentio/sdk                             │
│ createPolicy, issueCredential, createAgent │
└────────────────────────────────────────────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
┌────────────┐ ┌─────────┐ ┌────────────┐
│ Proof      │ │ State   │ │ Transport  │
│ Noir       │ │ 0G      │ │ AXL        │
└────────────┘ └─────────┘ └────────────┘
        │         │         │
        ▼         ▼         ▼
  ZK proofs   Registry,   P2P agent
              receipts,   discovery,
              logs        signals
```

---

## Package layout

Recommended package structure:

```txt
packages/
  core/        # TypeScript: policy, credentials, budget accounting
  noir/        # Noir circuits + TypeScript proof wrappers
  contracts/   # Solidity + Hardhat/Foundry deploy scripts
  storage/     # TypeScript 0G Storage adapter
  axl/         # TypeScript AXL HTTP adapter
  sdk/         # Batteries-included developer API
apps/
  trade/       # TypeScript agent demo using Uniswap API
examples/
  basic/       # Minimal framework example
```

For hackathon clarity, expose `@0xagentio/sdk` as the main package and keep subpackages available for advanced users.

---

## Package responsibilities

### `@0xagentio/core`

Pure TypeScript. Ideally no 0G, AXL, or Noir runtime dependency.

Responsibilities:

- policy model
- credential model
- delegation signatures
- action intent model
- budget accounting
- serialization
- hashes and commitments

Example API:

```ts
createPolicy();
hashPolicy();
signDelegation();
validateActionAgainstPolicyShape();
```

---

### `@0xagentio/noir`

Proof adapter.

Responsibilities:

- load compiled circuit artifact
- build witness inputs
- generate proof
- verify proof locally
- export Solidity verifier artifacts
- format public inputs for Solidity verifier calls

Example API:

```ts
generateCredentialProof();
verifyCredentialProof();
formatPublicInputsForSolidity();
```

Noir proves statements such as:

```txt
I am an agent delegated by a valid principal.
This action matches my policy.
This trade amount is within my per-action limit.
My cumulative spend remains within my total budget.
My credential has not expired.
```

But it should not reveal:

- principal identity, if designed around commitments
- full policy contents
- total budget
- cumulative spend
- private strategy inputs

---

### `@0xagentio/contracts`

Solidity contracts and deployment utilities.

Responsibilities:

- generated Noir/Barretenberg verifier contract
- `KYARegistry.sol`
- deployment scripts for 0G Chain
- typed contract bindings

Potential contract API:

```solidity
registerCredentialCommitment(...)
verifyAndLog(bytes proof, bytes32[] publicInputs)
revokeCredential(bytes32 credentialId)
isCredentialValid(bytes32 credentialId)
```

0G Chain is EVM-compatible, so Solidity plus Hardhat or Foundry is the right path.

---

### `@0xagentio/storage`

0G Storage adapter.

Responsibilities:

- persist spend state
- append audit logs
- fetch audit history
- store receipts/proof metadata
- recover agent state after restart

Example API:

```ts
saveAgentState();
loadAgentState();
appendAuditLog();
getAuditHistory();
```

Use 0G Storage for data that should persist but does not need to be contract state:

```txt
- agent cumulative spend state
- verification receipts
- audit logs
- credential metadata
- message receipts
- demo trading history
```

---

### `@0xagentio/axl`

Gensyn AXL transport adapter.

Responsibilities:

- communicate with local AXL node
- peer discovery
- message envelopes
- credential-gated callbacks
- signal broadcast
- verification before messages reach application code

Example API:

```ts
announcePeer();
discoverPeers();
presentCredential();
broadcastSignal();
onVerifiedSignal();
```

Important design choice:

> `@0xagentio/axl` should verify credentials before messages reach app code.

Instead of forcing developers to write this:

```ts
onMessage((msg) => {
  const ok = verify(msg.proof);
  if (ok) handle(msg);
});
```

The SDK should provide this:

```ts
network.onVerifiedSignal((signal) => {
  handle(signal);
});
```

That is a core product value.

---

### `@0xagentio/sdk`

High-level convenience layer.

Responsibilities:

- combine all lower-level packages
- provide simple “trusted agent” API
- hide setup complexity
- offer sensible defaults

Example API:

```ts
const agent = await createTrustedAgent({
  policy,
  principalSigner,
  axl: { nodeUrl },
  storage: { indexerUrl, rpcUrl },
});
```

---

## End-to-end developer flow

### Step 1 — Install

```sh
npm install @0xagentio/sdk
```

Advanced users can install subpackages directly:

```sh
npm install @0xagentio/core @0xagentio/axl @0xagentio/storage
```

---

### Step 2 — Define policy

```ts
const policy = createPolicy({
  allowedActions: ['swap'],
  allowedPairs: ['ETH/USDC'],
  maxPerActionUsd: 500,
  totalBudgetUsd: 5_000,
  expiresAt: Date.now() + 30 * DAY,
});
```

This produces:

```txt
policy object
policy hash
private policy witness fields
public commitment
```

---

### Step 3 — Issue credential

```ts
const credential = await issueCredential({
  principal: principalSigner,
  agentPublicKey,
  policy,
});
```

This creates:

```txt
delegation signature
credential commitment
policy hash
agent identity
expiry
```

Optionally:

```ts
await registry.registerCredential(credential);
```

Which writes a commitment to 0G Chain.

---

### Step 4 — Agent proves an action

```ts
const proof = await agent.proveAction({
  type: 'swap',
  pair: 'ETH/USDC',
  amountUsd: 250,
});
```

Internally:

```txt
load cumulative spend from 0G Storage
build Noir witness
generate Barretenberg proof
return proof + public inputs
```

---

### Step 5 — Agent sends proof over AXL

```ts
await agent.sendCredential(peerId, proof);
```

Or for signals:

```ts
await agent.broadcastSignal({
  pair: 'ETH/USDC',
  direction: 'buy',
  confidence: 0.8,
  proof,
});
```

Internally:

```txt
serialize message
send via local AXL node
remote peer receives message
remote @0xagentio/axl verifies proof
only valid messages reach application callback
```

---

### Step 6 — Store audit trail on 0G

```ts
await agent.audit.log({
  action: 'swap',
  amountUsd: 250,
  proofHash,
  verifiedBy: verifierAgentId,
});
```

This gives the developer and judges a persistent demo trail.

---

## Technology integration details

### Noir connection

Noir is used for private authorization proofs.

Flow:

```txt
policy + delegation + spend state
        ↓
Noir witness
        ↓
Barretenberg proof
        ↓
public inputs + proof bytes
```

Developer-facing API:

```ts
const proof = await agent.proveAction({
  action: 'swap',
  pair: 'ETH/USDC',
  amountUsd: 250,
});
```

---

### 0G connection

0G provides the persistent trust substrate.

Use 0G Chain for:

```txt
- credential commitments
- verifier contract deployment
- revocation registry
- verification event logs
```

Use 0G Storage for:

```txt
- full audit receipts
- cumulative spend state
- agent activity history
- message/proof metadata
```

Flow:

```txt
agent action
   ↓
proof generated
   ↓
verification receipt
   ↓
0G Storage log
   ↓
optional onchain event on 0G Chain
```

---

### AXL connection

AXL is the agent communication layer.

Message types:

```txt
CREDENTIAL_PRESENT
CREDENTIAL_VERIFY
MARKET_SIGNAL
SIGNAL_ACK
PEER_ANNOUNCE
PEER_DISCOVER
```

Developer-facing API:

```ts
const network = createTrustNetwork({
  transport: axlTransport({ nodeUrl: 'http://localhost:...' }),
  verifier: agent.verifier,
});

await network.announce({
  role: 'trading-agent',
  capabilities: ['swap:ETH-USDC', 'market-signals'],
});

network.onVerifiedSignal(async (signal) => {
  // only verified signals reach here
});
```
