import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Minimal compiled Noir circuit shape needed by the NoirJS adapter.
 *
 * The full Nargo artifact includes debug metadata and file maps, but proving
 * only needs a compiled circuit object with bytecode and ABI data. Keeping this
 * type narrow makes it easier for SDK users to understand which generated
 * fields are actually part of the adapter contract.
 */
export type AuthorizationCircuitArtifact = {
  readonly bytecode: string;
  readonly abi: unknown;
  readonly noir_version?: string;
  readonly hash?: number;
};

/**
 * Loads the compiled authorization circuit artifact produced by `nargo compile`.
 *
 * Developers should use this helper when wiring `noirProofs()` because it keeps
 * artifact path handling and basic shape validation in one place. The adapter
 * can then receive a trustworthy compiled circuit object instead of reading
 * arbitrary JSON at proof time.
 */
export async function loadAuthorizationCircuitArtifact(
  artifactPath = defaultAuthorizationCircuitArtifactPath(),
): Promise<AuthorizationCircuitArtifact> {
  const raw = await readFile(artifactPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  return parseAuthorizationCircuitArtifact(parsed, artifactPath);
}

/**
 * Validates that an unknown JSON value looks like a compiled authorization circuit.
 *
 * This is intentionally small but important: without this check, a missing or
 * stale compile artifact would fail later inside NoirJS with a less actionable
 * backend error.
 */
export function parseAuthorizationCircuitArtifact(
  value: unknown,
  source = 'authorization circuit artifact',
): AuthorizationCircuitArtifact {
  if (!isRecord(value)) {
    throw new TypeError(`Invalid ${source}: expected a JSON object.`);
  }

  if (typeof value.bytecode !== 'string' || value.bytecode.length === 0) {
    throw new TypeError(`Invalid ${source}: missing bytecode.`);
  }

  if (!('abi' in value)) {
    throw new TypeError(`Invalid ${source}: missing abi.`);
  }

  return {
    bytecode: value.bytecode,
    abi: value.abi,
    noir_version: typeof value.noir_version === 'string' ? value.noir_version : undefined,
    hash: typeof value.hash === 'number' ? value.hash : undefined,
  };
}

/**
 * Returns the conventional location of the generated authorization circuit JSON.
 *
 * The file is generated, not hand-authored. Run `npm run noir:compile` before
 * loading it in a fresh checkout.
 */
export function defaultAuthorizationCircuitArtifactPath(): string {
  return resolve('packages/noir/circuits/authorization/target/agentio_authorization.json');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
