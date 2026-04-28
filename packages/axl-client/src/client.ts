/** One running AXL node exposed through its local HTTP bridge. */
export type AxlClient = {
  /**
   * Reads the node's current network view.
   *
   * Developers use this to discover the local node peer id and inspect whether
   * the node is connected before sending agent messages through AXL.
   */
  readonly getTopology: () => Promise<AxlTopology>;

  /**
   * Sends one binary message to a remote AXL peer.
   *
   * AgentIO uses this as the lowest-level transport primitive: higher layers
   * encode policies, proofs, and correlation ids into the body before AXL moves
   * the bytes to the destination peer.
   */
  readonly send: (input: AxlSendInput) => Promise<AxlSendResult>;

  /**
   * Polls one pending inbound binary message.
   *
   * AXL exposes receive as polling, so framework adapters can call this in a
   * loop and dispatch decoded messages into their own event/listener model.
   */
  readonly recv: () => Promise<AxlReceivedMessage | undefined>;
};

/** Network information returned by an AXL node's `/topology` endpoint. */
export type AxlTopology = {
  readonly ourIpv6?: string;
  readonly ourPublicKey?: string;
  readonly peers?: readonly unknown[];
  readonly tree?: readonly unknown[];
  readonly raw: unknown;
};

/** Binary payload for AXL's fire-and-forget `/send` endpoint. */
export type AxlSendInput = {
  readonly peerId: string;
  readonly body: Uint8Array;
};

/** Result metadata returned after AXL accepts a message for delivery. */
export type AxlSendResult = {
  readonly sentBytes?: number;
};

/** One inbound binary payload received from a remote AXL peer. */
export type AxlReceivedMessage = {
  /**
   * Source id reported by AXL's raw receive endpoint.
   *
   * AXL derives this from the remote network address for raw `/recv` messages;
   * use it as transport metadata, not as a guaranteed application identity.
   */
  readonly fromPeerId: string;
  readonly body: Uint8Array;
};

/** Configuration for connecting to a local AXL HTTP bridge. */
export type AxlClientOptions = {
  /** Base URL for the AXL node HTTP API, for example `http://127.0.0.1:9002`. */
  readonly baseUrl: string;
  /** Custom fetch implementation used by tests or non-standard runtimes. */
  readonly fetch?: typeof fetch;
};

/** Error thrown when the AXL HTTP bridge rejects or cannot satisfy a request. */
export class AxlHttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: string;

  constructor(message: string, response: Pick<Response, 'status' | 'statusText'>, body: string) {
    super(message);
    this.name = 'AxlHttpError';
    this.status = response.status;
    this.statusText = response.statusText;
    this.body = body;
  }
}

/**
 * Creates a thin TypeScript client for AXL's local HTTP API.
 *
 * This keeps AgentIO independent from raw endpoint details while preserving
 * AXL's role as a transport-only service: the client moves bytes and exposes
 * topology, but does not interpret proofs, policies, or agent intents.
 */
export function createAxlClient(options: AxlClientOptions): AxlClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetch ?? globalThis.fetch;

  if (fetchImpl === undefined) {
    throw new TypeError('createAxlClient requires a fetch implementation.');
  }

  return {
    async getTopology() {
      const response = await fetchImpl(`${baseUrl}/topology`, { method: 'GET' });
      await assertOk(response, 'AXL topology request failed');
      return normalizeTopology(await response.json());
    },

    async send(input) {
      if (input.peerId.trim() === '') {
        throw new TypeError('AXL peerId must not be empty.');
      }

      const response = await fetchImpl(`${baseUrl}/send`, {
        method: 'POST',
        headers: {
          'X-Destination-Peer-Id': input.peerId,
          'Content-Type': 'application/octet-stream',
        },
        body: toRequestBody(input.body),
      });
      await assertOk(response, 'AXL send request failed');

      return { sentBytes: parseOptionalIntegerHeader(response.headers.get('X-Sent-Bytes')) };
    },

    async recv() {
      const response = await fetchImpl(`${baseUrl}/recv`, { method: 'GET' });

      if (response.status === 204) {
        return undefined;
      }

      await assertOk(response, 'AXL receive request failed');

      const fromPeerId = response.headers.get('X-From-Peer-Id');
      if (fromPeerId === null || fromPeerId.trim() === '') {
        throw new AxlHttpError('AXL receive response did not include X-From-Peer-Id.', response, '');
      }

      return {
        fromPeerId,
        body: new Uint8Array(await response.arrayBuffer()),
      };
    },
  };
}

function toRequestBody(body: Uint8Array): ArrayBuffer {
  return new Uint8Array(body).buffer;
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (trimmed === '') {
    throw new TypeError('AXL baseUrl must not be empty.');
  }
  return trimmed.replace(/\/+$/, '');
}

async function assertOk(response: Response, message: string): Promise<void> {
  if (response.ok) {
    return;
  }

  let body = '';
  try {
    body = await response.text();
  } catch {
    // ignore body decoding failures; status is still enough to explain the failure.
  }

  throw new AxlHttpError(`${message}: ${response.status} ${response.statusText}`, response, body);
}

function normalizeTopology(raw: unknown): AxlTopology {
  if (!isRecord(raw)) {
    throw new TypeError('AXL topology response must be an object.');
  }

  return {
    ourIpv6: typeof raw.our_ipv6 === 'string' ? raw.our_ipv6 : undefined,
    ourPublicKey: typeof raw.our_public_key === 'string' ? raw.our_public_key : undefined,
    peers: Array.isArray(raw.peers) ? raw.peers : undefined,
    tree: Array.isArray(raw.tree) ? raw.tree : undefined,
    raw,
  };
}

function parseOptionalIntegerHeader(value: string | null): number | undefined {
  if (value === null || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
