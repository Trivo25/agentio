import assert from 'node:assert/strict';
import test from 'node:test';

import { AxlHttpError, createAxlClient } from './index.js';

test('createAxlClient reads topology from the AXL HTTP bridge', async () => {
  const calls: RecordedFetchCall[] = [];
  const client = createAxlClient({
    baseUrl: 'http://127.0.0.1:9002/',
    fetch: fakeFetch(calls, [
      jsonResponse({
        our_ipv6: '200:abcd::1',
        our_public_key: 'a'.repeat(64),
        peers: ['peer-a'],
        tree: ['root'],
      }),
    ]),
  });

  const topology = await client.getTopology();

  assert.equal(calls[0]?.url, 'http://127.0.0.1:9002/topology');
  assert.equal(calls[0]?.init?.method, 'GET');
  assert.equal(topology.ourIpv6, '200:abcd::1');
  assert.equal(topology.ourPublicKey, 'a'.repeat(64));
  assert.deepEqual(topology.peers, ['peer-a']);
  assert.deepEqual(topology.tree, ['root']);
});

test('createAxlClient sends binary messages with the destination peer header', async () => {
  const calls: RecordedFetchCall[] = [];
  const client = createAxlClient({
    baseUrl: 'http://127.0.0.1:9002',
    fetch: fakeFetch(calls, [new Response(null, { status: 200, headers: { 'X-Sent-Bytes': '3' } })]),
  });

  const body = new Uint8Array([1, 2, 3]);
  const result = await client.send({ peerId: 'b'.repeat(64), body });

  assert.equal(calls[0]?.url, 'http://127.0.0.1:9002/send');
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.equal(getHeader(calls[0]?.init?.headers, 'X-Destination-Peer-Id'), 'b'.repeat(64));
  assert.equal(getHeader(calls[0]?.init?.headers, 'Content-Type'), 'application/octet-stream');
  assert.deepEqual(new Uint8Array(calls[0]?.init?.body as ArrayBuffer), body);
  assert.deepEqual(result, { sentBytes: 3 });
});

test('createAxlClient receives binary messages and peer metadata', async () => {
  const calls: RecordedFetchCall[] = [];
  const client = createAxlClient({
    baseUrl: 'http://127.0.0.1:9002',
    fetch: fakeFetch(calls, [
      new Response(new Uint8Array([4, 5, 6]), {
        status: 200,
        headers: { 'X-From-Peer-Id': 'c'.repeat(64) },
      }),
    ]),
  });

  const message = await client.recv();

  assert.equal(calls[0]?.url, 'http://127.0.0.1:9002/recv');
  assert.equal(calls[0]?.init?.method, 'GET');
  assert.equal(message?.fromPeerId, 'c'.repeat(64));
  assert.deepEqual(message?.body, new Uint8Array([4, 5, 6]));
});

test('createAxlClient returns undefined when receive queue is empty', async () => {
  const client = createAxlClient({
    baseUrl: 'http://127.0.0.1:9002',
    fetch: fakeFetch([], [new Response(null, { status: 204 })]),
  });

  assert.equal(await client.recv(), undefined);
});

test('createAxlClient surfaces non-2xx AXL responses with status and body', async () => {
  const client = createAxlClient({
    baseUrl: 'http://127.0.0.1:9002',
    fetch: fakeFetch([], [new Response('no route', { status: 502, statusText: 'Bad Gateway' })]),
  });

  await assert.rejects(client.getTopology(), (error) => {
    assert.ok(error instanceof AxlHttpError);
    assert.equal(error.status, 502);
    assert.equal(error.statusText, 'Bad Gateway');
    assert.equal(error.body, 'no route');
    return true;
  });
});

type RecordedFetchCall = {
  readonly url: string;
  readonly init?: RequestInit;
};

function fakeFetch(calls: RecordedFetchCall[], responses: Response[]): typeof fetch {
  return async (input, init) => {
    calls.push({ url: String(input), init });
    const response = responses.shift();
    if (response === undefined) {
      throw new Error('Unexpected fetch call.');
    }
    return response;
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getHeader(headers: HeadersInit | undefined, key: string): string | undefined {
  if (headers === undefined) {
    return undefined;
  }
  return new Headers(headers).get(key) ?? undefined;
}
