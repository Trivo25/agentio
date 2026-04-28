# @0xagentio/axl-client

Small TypeScript client for the Gensyn AXL node HTTP bridge.

AXL is a Go node that exposes a local HTTP API. This package does not run the
node. It talks to one already-running node and gives TypeScript applications a
minimal API for topology inspection, sending binary messages, and polling
received binary messages.

## Install

```bash
npm install @0xagentio/axl-client
```

## Usage

```ts
import { createAxlClient } from '@0xagentio/axl-client';

const axl = createAxlClient({
  baseUrl: 'http://127.0.0.1:9002',
});

const topology = await axl.getTopology();
console.log(topology.ourPublicKey);

await axl.send({
  peerId: 'remote-ed25519-public-key-hex',
  body: new TextEncoder().encode('hello from TypeScript'),
});

const incoming = await axl.recv();
if (incoming !== undefined) {
  console.log(incoming.fromPeerId);
  console.log(new TextDecoder().decode(incoming.body));
}
```

## API

### `createAxlClient(options)`

Creates a client for one AXL HTTP bridge.

```ts
const client = createAxlClient({
  baseUrl: 'http://127.0.0.1:9002',
});
```

Options:

- `baseUrl`: base URL of the AXL node HTTP bridge.
- `fetch`: optional custom fetch implementation for tests or non-standard runtimes.

### `client.getTopology()`

Calls AXL `GET /topology` and returns normalized topology fields plus the raw
response.

### `client.send({ peerId, body })`

Calls AXL `POST /send` with `X-Destination-Peer-Id` and a binary body.

### `client.recv()`

Calls AXL `GET /recv`.

Returns `undefined` when AXL responds with `204 No Content`, otherwise returns
the sender peer id and binary body.

## Design boundary

This client intentionally only moves bytes through AXL. It does not interpret
agent messages, proofs, policies, reasoning results, or application-specific
payloads. Higher-level frameworks should encode those concepts before calling
`send` and decode them after `recv`.
