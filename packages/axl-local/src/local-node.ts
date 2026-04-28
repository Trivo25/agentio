import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';

import { createAxlClient, type AxlClient } from '@0xagentio/axl-client';

import { createLocalAxlNodeConfig, type AxlNodeConfig } from './config.js';

/** Options for starting one local AXL node process. */
export type StartLocalAxlNodeOptions = {
  /** Human-readable name used for folders and diagnostics. */
  readonly name: string;
  /** Path to the compiled AXL `node` binary. */
  readonly binaryPath: string;
  /** Directory where config, keys, and local process artifacts are written. */
  readonly workingDirectory: string;
  /** HTTP bridge port used by this node. */
  readonly apiPort: number;
  /** HTTP bridge bind address; defaults to `127.0.0.1`. */
  readonly bridgeAddr?: string;
  /** Optional key path. If absent, `private.pem` is created inside the working directory. */
  readonly privateKeyPath?: string;
  /** Remote AXL peer addresses this node should dial. */
  readonly peers?: readonly string[];
  /** Local AXL peer addresses this node should listen on. */
  readonly listen?: readonly string[];
  /** Optional internal TCP port used by the AXL userspace network stack. */
  readonly tcpPort?: number;
  /** Time to wait until `/topology` responds. */
  readonly startupTimeoutMs?: number;
  /** Polling interval for readiness checks. */
  readonly readinessPollMs?: number;
  /** Optional process environment override for tests and advanced local setups. */
  readonly env?: NodeJS.ProcessEnv;
};

/** Handle for one running local AXL node. */
export type LocalAxlNode = {
  /** Human-readable node name. */
  readonly name: string;
  /** Peer id reported by AXL topology, usually the ed25519 public key. */
  readonly peerId: string;
  /** Base URL for this node's HTTP bridge. */
  readonly baseUrl: string;
  /** HTTP bridge port used by TypeScript clients. */
  readonly apiPort: number;
  /** Absolute path to the generated AXL config file. */
  readonly configPath: string;
  /** Absolute path to the ed25519 private key PEM file. */
  readonly privateKeyPath: string;
  /** Client connected to this local node. */
  readonly client: AxlClient;
  /** Stops the node process. */
  readonly stop: () => Promise<void>;
};

/** Prepared local node files that can be inspected before spawning the process. */
export type PreparedLocalAxlNode = {
  readonly name: string;
  readonly baseUrl: string;
  readonly configPath: string;
  readonly privateKeyPath: string;
  readonly config: AxlNodeConfig;
};

/**
 * Writes key and config files for one local AXL node without starting it.
 *
 * This is useful for tests, examples, and debugging because developers can
 * inspect exactly which ports, peers, and key files will be used before any
 * long-lived process is spawned.
 */
export async function prepareLocalAxlNode(options: StartLocalAxlNodeOptions): Promise<PreparedLocalAxlNode> {
  const workingDirectory = resolve(options.workingDirectory);
  const privateKeyPath = resolvePath(workingDirectory, options.privateKeyPath ?? 'private.pem');
  const configPath = join(workingDirectory, 'node-config.json');
  const bridgeAddr = options.bridgeAddr ?? '127.0.0.1';
  const config = createLocalAxlNodeConfig({
    privateKeyPath,
    apiPort: options.apiPort,
    bridgeAddr,
    peers: options.peers,
    listen: options.listen,
    tcpPort: options.tcpPort,
  });

  await mkdir(workingDirectory, { recursive: true });
  await ensureEd25519PrivateKey(privateKeyPath);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  return {
    name: options.name,
    baseUrl: `http://${bridgeAddr}:${options.apiPort}`,
    configPath,
    privateKeyPath,
    config,
  };
}

/**
 * Starts one local AXL node and returns a TypeScript client connected to it.
 *
 * Local examples use this to run against real AXL processes while keeping the
 * rest of the framework code identical to production, where a node may already
 * be managed by the developer's infrastructure.
 */
export async function startLocalAxlNode(options: StartLocalAxlNodeOptions): Promise<LocalAxlNode> {
  const prepared = await prepareLocalAxlNode(options);
  const child = spawn(resolve(options.binaryPath), ['-config', prepared.configPath], {
    cwd: dirname(prepared.configPath),
    env: options.env ?? process.env,
  });
  const client = createAxlClient({ baseUrl: prepared.baseUrl });

  try {
    const peerId = await waitForPeerId(client, options.startupTimeoutMs ?? 10_000, options.readinessPollMs ?? 100);
    return {
      name: prepared.name,
      peerId,
      baseUrl: prepared.baseUrl,
      apiPort: options.apiPort,
      configPath: prepared.configPath,
      privateKeyPath: prepared.privateKeyPath,
      client,
      stop: () => stopChild(child),
    };
  } catch (error) {
    await stopChild(child);
    throw error;
  }
}

async function ensureEd25519PrivateKey(privateKeyPath: string): Promise<void> {
  if (existsSync(privateKeyPath)) {
    return;
  }

  await mkdir(dirname(privateKeyPath), { recursive: true });
  const { privateKey } = generateKeyPairSync('ed25519');
  await writeFile(
    privateKeyPath,
    privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    { encoding: 'utf8', mode: 0o600 },
  );
}

async function waitForPeerId(client: AxlClient, timeoutMs: number, pollMs: number): Promise<string> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const topology = await client.getTopology();
      if (topology.ourPublicKey !== undefined && topology.ourPublicKey.trim() !== '') {
        return topology.ourPublicKey;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(pollMs);
  }

  throw new Error(`AXL node did not become ready within ${timeoutMs}ms.${formatLastError(lastError)}`);
}

function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    return Promise.resolve();
  }

  return new Promise((resolveStop) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        child.kill('SIGKILL');
      }
      resolveStop();
    }, 2_000);

    child.once('exit', () => {
      clearTimeout(timer);
      resolveStop();
    });
    child.kill('SIGTERM');
  });
}

function resolvePath(baseDirectory: string, path: string): string {
  return isAbsolute(path) ? path : resolve(baseDirectory, path);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function formatLastError(error: unknown): string {
  if (error instanceof Error) {
    return ` Last error: ${error.message}`;
  }
  return '';
}

