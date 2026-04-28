import assert from 'node:assert/strict';
import test from 'node:test';

import { createLocalAxlNodeConfig } from './index.js';

test('createLocalAxlNodeConfig builds an AXL node config with safe defaults', () => {
  const config = createLocalAxlNodeConfig({
    privateKeyPath: '/tmp/alice/private.pem',
    apiPort: 9101,
  });

  assert.deepEqual(config, {
    PrivateKeyPath: '/tmp/alice/private.pem',
    Peers: [],
    Listen: [],
    api_port: 9101,
    bridge_addr: '127.0.0.1',
  });
});

test('createLocalAxlNodeConfig preserves peer, listen, bridge, and tcp settings', () => {
  const config = createLocalAxlNodeConfig({
    privateKeyPath: '/tmp/bob/private.pem',
    apiPort: 9102,
    bridgeAddr: '127.0.0.2',
    peers: ['tls://127.0.0.1:9201'],
    listen: ['tls://127.0.0.1:9202'],
    tcpPort: 7102,
  });

  assert.deepEqual(config, {
    PrivateKeyPath: '/tmp/bob/private.pem',
    Peers: ['tls://127.0.0.1:9201'],
    Listen: ['tls://127.0.0.1:9202'],
    api_port: 9102,
    bridge_addr: '127.0.0.2',
    tcp_port: 7102,
  });
});

test('createLocalAxlNodeConfig rejects invalid ports', () => {
  assert.throws(
    () => createLocalAxlNodeConfig({ privateKeyPath: '/tmp/private.pem', apiPort: 0 }),
    /apiPort/,
  );
  assert.throws(
    () => createLocalAxlNodeConfig({ privateKeyPath: '/tmp/private.pem', apiPort: 9101, tcpPort: 70000 }),
    /tcpPort/,
  );
});
