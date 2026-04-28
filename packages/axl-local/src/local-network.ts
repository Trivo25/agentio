import { join, resolve } from 'node:path';

import {
  startLocalAxlNode,
  type LocalAxlNode,
  type StartLocalAxlNodeOptions,
} from './local-node.js';

/** Options for one node inside a local AXL network. */
export type LocalAxlNetworkNodeOptions = Omit<
  StartLocalAxlNodeOptions,
  'binaryPath' | 'workingDirectory' | 'startupTimeoutMs' | 'readinessPollMs' | 'env'
> & {
  /** Optional folder name override. Defaults to the node name. */
  readonly directoryName?: string;
};

/** Options for starting multiple local AXL nodes as one test network. */
export type StartLocalAxlNetworkOptions = {
  /** Path to the compiled AXL `node` binary used for every local node. */
  readonly binaryPath: string;
  /** Parent directory where per-node folders are created. */
  readonly workingDirectory: string;
  /** Node definitions. Peering is explicit so examples can show the intended topology. */
  readonly nodes: readonly LocalAxlNetworkNodeOptions[];
  /** Time to wait for each node's `/topology` endpoint. */
  readonly startupTimeoutMs?: number;
  /** Polling interval for node readiness checks. */
  readonly readinessPollMs?: number;
  /** Optional process environment override for all local nodes. */
  readonly env?: NodeJS.ProcessEnv;
};

/** Handle for a running local AXL network. */
export type LocalAxlNetwork = {
  /** Running nodes in startup order. */
  readonly nodes: readonly LocalAxlNode[];
  /** Looks up a running node by its local name. */
  readonly node: (name: string) => LocalAxlNode;
  /** Stops all nodes in reverse startup order. */
  readonly stop: () => Promise<void>;
};

/**
 * Starts multiple local AXL nodes and returns named handles for examples/tests.
 *
 * This gives developers a compact way to model real peer-to-peer AgentIO flows
 * locally: each agent can get its own AXL process, HTTP client, peer id, and
 * lifecycle cleanup without hand-managing ports and child processes.
 */
export async function startLocalAxlNetwork(options: StartLocalAxlNetworkOptions): Promise<LocalAxlNetwork> {
  assertUniqueNodeNames(options.nodes);

  const started: LocalAxlNode[] = [];
  try {
    for (const nodeOptions of options.nodes) {
      const node = await startLocalAxlNode({
        ...nodeOptions,
        binaryPath: options.binaryPath,
        workingDirectory: join(resolve(options.workingDirectory), nodeOptions.directoryName ?? nodeOptions.name),
        startupTimeoutMs: options.startupTimeoutMs,
        readinessPollMs: options.readinessPollMs,
        env: options.env,
      });
      started.push(node);
    }
  } catch (error) {
    await stopNodes(started);
    throw error;
  }

  return {
    nodes: started,
    node(name) {
      const node = started.find((candidate) => candidate.name === name);
      if (node === undefined) {
        throw new Error(`Unknown local AXL node: ${name}`);
      }
      return node;
    },
    stop: () => stopNodes(started),
  };
}

function assertUniqueNodeNames(nodes: readonly LocalAxlNetworkNodeOptions[]): void {
  const names = new Set<string>();
  for (const node of nodes) {
    if (node.name.trim() === '') {
      throw new TypeError('Local AXL node name must not be empty.');
    }
    if (names.has(node.name)) {
      throw new TypeError(`Duplicate local AXL node name: ${node.name}`);
    }
    names.add(node.name);
  }
}

async function stopNodes(nodes: readonly LocalAxlNode[]): Promise<void> {
  await Promise.all([...nodes].reverse().map((node) => node.stop()));
}
