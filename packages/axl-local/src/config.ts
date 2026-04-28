/** Configuration file shape consumed by the AXL node binary. */
export type AxlNodeConfig = {
  readonly PrivateKeyPath: string;
  readonly Peers: readonly string[];
  readonly Listen: readonly string[];
  readonly api_port: number;
  readonly bridge_addr: string;
  readonly tcp_port?: number;
  readonly router_addr?: string;
  readonly router_port?: number;
  readonly a2a_addr?: string;
  readonly a2a_port?: number;
  readonly max_message_size?: number;
  readonly max_concurrent_conns?: number;
  readonly conn_read_timeout_secs?: number;
  readonly conn_idle_timeout_secs?: number;
};

/** Options used to generate a local AXL node config for development networks. */
export type LocalAxlNodeConfigOptions = {
  /** Path to the ed25519 private key PEM file that gives the node a stable peer id. */
  readonly privateKeyPath: string;
  /** HTTP bridge port used by TypeScript clients to talk to this node. */
  readonly apiPort: number;
  /** HTTP bridge address; defaults to localhost so local nodes are not exposed accidentally. */
  readonly bridgeAddr?: string;
  /** Remote AXL peer addresses this node should dial on startup. */
  readonly peers?: readonly string[];
  /** Local AXL addresses this node should expose for other peers. */
  readonly listen?: readonly string[];
  /** Optional internal TCP port used by the AXL userspace network stack. */
  readonly tcpPort?: number;
};

/**
 * Builds the `node-config.json` content for a local AXL node.
 *
 * Developers use this before spawning nodes so tests and examples can create
 * deterministic, inspectable AXL configs instead of relying on hand-written
 * files with hidden ports or peer wiring.
 */
export function createLocalAxlNodeConfig(options: LocalAxlNodeConfigOptions): AxlNodeConfig {
  if (options.privateKeyPath.trim() === '') {
    throw new TypeError('AXL privateKeyPath must not be empty.');
  }
  assertPort(options.apiPort, 'apiPort');
  if (options.tcpPort !== undefined) {
    assertPort(options.tcpPort, 'tcpPort');
  }

  return {
    PrivateKeyPath: options.privateKeyPath,
    Peers: [...(options.peers ?? [])],
    Listen: [...(options.listen ?? [])],
    api_port: options.apiPort,
    bridge_addr: options.bridgeAddr ?? '127.0.0.1',
    ...(options.tcpPort === undefined ? {} : { tcp_port: options.tcpPort }),
  };
}

function assertPort(port: number, name: string): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RangeError(`AXL ${name} must be an integer between 1 and 65535.`);
  }
}
