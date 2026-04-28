import type { AxlClient } from '@0xagentio/axl-client';
import type { AgentMessage, MessageHandler, PeerId, TransportAdapter } from '@0xagentio/core';

/** Options for using a Gensyn AXL node as an AgentIO transport. */
export type AxlTransportOptions = {
  /** Client connected to one running AXL node. */
  readonly client: AxlClient;
  /** How often the adapter polls AXL's `/recv` endpoint after handlers are registered. */
  readonly pollIntervalMs?: number;
  /** Peers that should receive `broadcast` messages because AXL itself has no raw broadcast endpoint. */
  readonly broadcastPeers?: readonly PeerId[];
  /** Optional hook for surfacing polling errors to application logs or tests. */
  readonly onError?: (error: unknown) => void;
};

/** AgentIO transport backed by a running Gensyn AXL node. */
export type AxlTransport = TransportAdapter & {
  /** Starts receive polling before the first handler is registered. */
  readonly start: () => void;
  /** Stops receive polling so local examples and tests can release timers cleanly. */
  readonly stop: () => void;
};

/**
 * Creates an AgentIO transport that sends messages through a Gensyn AXL node.
 *
 * Developers use this when they want the same `createAgentPeer` API to work over
 * real AXL networking. The adapter serializes `AgentMessage` values to JSON
 * bytes for AXL and turns received bytes back into typed AgentIO messages.
 */
export function axlTransport(options: AxlTransportOptions): AxlTransport {
  const handlers: MessageHandler[] = [];
  const pollIntervalMs = options.pollIntervalMs ?? 250;
  let timer: ReturnType<typeof setInterval> | undefined;
  let polling = false;

  async function pollOnce(): Promise<void> {
    if (polling) {
      return;
    }

    polling = true;
    try {
      while (true) {
        const received = await options.client.recv();
        if (received === undefined) {
          break;
        }
        const message = decodeAgentMessage(received.body);
        for (const handler of handlers) {
          await handler(message);
        }
      }
    } catch (error) {
      options.onError?.(error);
    } finally {
      polling = false;
    }
  }

  function start(): void {
    if (timer !== undefined) {
      return;
    }
    timer = setInterval(() => {
      void pollOnce();
    }, pollIntervalMs);
    void pollOnce();
  }

  return {
    async send(peerId, message) {
      await options.client.send({ peerId, body: encodeAgentMessage(message) });
    },

    async broadcast(message) {
      const peers = options.broadcastPeers ?? [];
      if (peers.length === 0) {
        throw new Error('AXL transport broadcast requires at least one configured broadcast peer.');
      }
      await Promise.all(peers.map((peerId) => options.client.send({ peerId, body: encodeAgentMessage(message) })));
    },

    onMessage(handler) {
      handlers.push(handler);
      start();
    },

    start,

    stop() {
      if (timer === undefined) {
        return;
      }
      clearInterval(timer);
      timer = undefined;
    },
  };
}

/**
 * Encodes an AgentIO message as the JSON payload carried by AXL.
 *
 * This is exported so examples and tests can inspect the wire format without
 * reaching into adapter internals. The format keeps dates as ISO strings because
 * AXL only transports bytes and should not interpret application objects.
 */
export function encodeAgentMessage(message: AgentMessage): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      ...message,
      createdAt: message.createdAt.toISOString(),
    }),
  );
}

/**
 * Decodes an AgentIO message from AXL bytes.
 *
 * Use this when receiving raw AXL messages outside the transport adapter but
 * still wanting the same message validation and `Date` restoration behavior.
 */
export function decodeAgentMessage(body: Uint8Array): AgentMessage {
  const parsed = JSON.parse(new TextDecoder().decode(body)) as unknown;
  if (!isRecord(parsed)) {
    throw new TypeError('AXL AgentIO message must be a JSON object.');
  }

  const { id, correlationId, replyTo, type, sender, createdAt, payload } = parsed;
  if (id !== undefined && typeof id !== 'string') {
    throw new TypeError('AXL AgentIO message id must be a string when present.');
  }
  if (correlationId !== undefined && typeof correlationId !== 'string') {
    throw new TypeError('AXL AgentIO message correlationId must be a string when present.');
  }
  if (replyTo !== undefined && typeof replyTo !== 'string') {
    throw new TypeError('AXL AgentIO message replyTo must be a string when present.');
  }
  if (typeof type !== 'string' || type === '') {
    throw new TypeError('AXL AgentIO message type must be a non-empty string.');
  }
  if (typeof sender !== 'string' || sender === '') {
    throw new TypeError('AXL AgentIO message sender must be a non-empty string.');
  }
  if (typeof createdAt !== 'string') {
    throw new TypeError('AXL AgentIO message createdAt must be an ISO string.');
  }
  if (!isRecord(payload)) {
    throw new TypeError('AXL AgentIO message payload must be an object.');
  }

  const createdAtDate = new Date(createdAt);
  if (Number.isNaN(createdAtDate.getTime())) {
    throw new TypeError('AXL AgentIO message createdAt must be a valid date.');
  }

  return {
    ...(id === undefined ? {} : { id }),
    ...(correlationId === undefined ? {} : { correlationId }),
    ...(replyTo === undefined ? {} : { replyTo }),
    type,
    sender,
    createdAt: createdAtDate,
    payload,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
