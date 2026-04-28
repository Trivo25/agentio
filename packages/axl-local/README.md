# @0xagentio/axl-local

Local process harness for Gensyn AXL nodes.

This package is for development, tests, and examples. It generates AXL node
config files, creates local ed25519 private keys, starts AXL node processes, waits
for readiness, and returns TypeScript clients from `@0xagentio/axl-client`.

## Install

```bash
npm install @0xagentio/axl-local @0xagentio/axl-client
```

You also need a compiled AXL `node` binary from the Gensyn AXL repository.

## AXL node binary requirement

This package does not reimplement AXL in TypeScript. It manages the real Go AXL
node process for you. Build the AXL node binary first:

```bash
git clone https://github.com/gensyn-ai/axl
cd axl
make build
```

Then point this package at the compiled binary, either through an environment
variable used by examples/tests:

```bash
AGENTIO_AXL_NODE_BINARY=/path/to/axl/node
```

or directly in TypeScript:

```ts
const node = await startLocalAxlNode({
  name: 'alice',
  binaryPath: '/path/to/axl/node',
  workingDirectory: '.agentio/axl/alice',
  apiPort: 9101,
});
```


## Single node

```ts
import { startLocalAxlNode } from '@0xagentio/axl-local';

const node = await startLocalAxlNode({
  name: 'alice',
  binaryPath: './vendor/axl/node',
  workingDirectory: '.agentio/axl/alice',
  apiPort: 9101,
  listen: ['tls://127.0.0.1:9201'],
});

console.log(node.peerId);
console.log(node.baseUrl);

await node.stop();
```

## Multi-node network

```ts
import { startLocalAxlNetwork } from '@0xagentio/axl-local';

const network = await startLocalAxlNetwork({
  binaryPath: './vendor/axl/node',
  workingDirectory: '.agentio/axl',
  nodes: [
    {
      name: 'alice',
      apiPort: 9101,
      listen: ['tls://127.0.0.1:9201'],
    },
    {
      name: 'bob',
      apiPort: 9102,
      peers: ['tls://127.0.0.1:9201'],
    },
  ],
});

const alice = network.node('alice');
const bob = network.node('bob');

await alice.client.send({
  peerId: bob.peerId,
  body: new TextEncoder().encode('hello bob'),
});

await network.stop();
```

## Config-only preparation

Use `prepareLocalAxlNode` when you want to inspect generated files before
starting a process.

```ts
const prepared = await prepareLocalAxlNode({
  name: 'alice',
  binaryPath: './vendor/axl/node',
  workingDirectory: '.agentio/axl/alice',
  apiPort: 9101,
});

console.log(prepared.configPath);
console.log(prepared.privateKeyPath);
```

## Test strategy

Normal package tests do not require the AXL binary. Real process tests should be
gated with an explicit binary path so CI and contributors do not accidentally
start network processes.

## AXL receive identity note

For raw `/recv` messages, AXL returns `X-From-Peer-Id` as transport metadata
derived from the remote network address. Treat it as the source id reported by
the transport, not as a guaranteed application-level identity. If your protocol
needs stable agent identity, include and verify that identity inside the message
payload.
