# AXL local network example

This example starts two local AXL node processes and sends a binary message from
Alice's node to Bob's node using the standalone AXL TypeScript packages.

It intentionally does not use AgentIO yet. The purpose is to verify and explain
the releasable AXL packages before they become a transport backend for the
framework.

## Run

Build the Gensyn AXL node binary first. The TypeScript packages manage the real
Go AXL node process; they do not reimplement AXL.

```bash
git clone https://github.com/gensyn-ai/axl
cd axl
make build
```

Then run this example with the compiled binary path:

```bash
AGENTIO_AXL_NODE_BINARY=/path/to/axl/node npm run example:axl:local-network
```

Optional port overrides:

```bash
AGENTIO_AXL_ALICE_API_PORT=19101 \
AGENTIO_AXL_ALICE_LISTEN_PORT=19201 \
AGENTIO_AXL_BOB_API_PORT=19102 \
AGENTIO_AXL_NODE_BINARY=/path/to/axl/node \
npm run example:axl:local-network
```

## AXL receive identity note

For raw `/recv` messages, AXL returns `X-From-Peer-Id` as transport metadata
derived from the remote network address. Treat it as the source id reported by
the transport, not as a guaranteed application-level identity. If your protocol
needs stable agent identity, include and verify that identity inside the message
payload.
