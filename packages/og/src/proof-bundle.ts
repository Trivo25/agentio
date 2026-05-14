import { createHash } from 'node:crypto';

import { memoryOgObjectClient } from './memory-client.js';
import type { OgObjectClient } from './index.js';

export type VerificationVerdict = 'pass' | 'fail' | 'needs_review';

export type ProofBundle = {
  readonly framework: string;
  readonly version: string;
  readonly agent_id?: string;
  readonly owner?: string;
  readonly task_id: string;
  readonly task_description?: string;
  readonly input_hash: string;
  readonly policy_hash?: string;
  readonly trace_hash?: string;
  readonly output_hash: string;
  readonly proof_hash: string;
  readonly verifier_result: VerificationVerdict;
  readonly model?: string;
  readonly compute_provider?: string;
  readonly storage_root?: string;
  readonly chain_tx?: string;
  readonly contract_address?: string;
  readonly proof_id?: string;
  readonly explorer_link?: string;
  readonly created_at: string;
};

export type CreateProofBundleOptions = {
  readonly framework?: string;
  readonly version?: string;
  readonly agentId?: string;
  readonly owner?: string;
  readonly taskId: string;
  readonly taskDescription?: string;
  readonly input?: unknown;
  readonly inputHash?: string;
  readonly policy?: unknown;
  readonly policyHash?: string;
  readonly trace?: unknown;
  readonly traceHash?: string;
  readonly output?: unknown;
  readonly outputHash?: string;
  readonly proof?: unknown;
  readonly proofHash?: string;
  readonly verifierResult: VerificationVerdict;
  readonly model?: string;
  readonly computeProvider?: string;
  readonly storageRoot?: string;
  readonly chainTx?: string;
  readonly contractAddress?: string;
  readonly proofId?: string;
  readonly explorerLink?: string;
  readonly createdAt?: Date | string;
};

export type UploadProofBundleTo0GOptions = {
  readonly client: OgObjectClient;
  readonly namespace?: string;
  readonly key?: string;
};

export type UploadProofBundleTo0GResult = {
  readonly storageRoot: string;
  readonly uri?: string;
  readonly bundle: ProofBundle;
};

export function createProofBundle(options: CreateProofBundleOptions): ProofBundle {
  return pruneUndefined({
    framework: options.framework ?? '0xAgentio',
    version: options.version ?? '0.1.0',
    agent_id: options.agentId,
    owner: options.owner,
    task_id: options.taskId,
    task_description: options.taskDescription,
    input_hash: options.inputHash ?? hashJson(options.input),
    policy_hash: options.policyHash ?? hashOptionalJson(options.policy),
    trace_hash: options.traceHash ?? hashOptionalJson(options.trace),
    output_hash: options.outputHash ?? hashJson(options.output),
    proof_hash: options.proofHash ?? hashJson(options.proof),
    verifier_result: options.verifierResult,
    model: options.model,
    compute_provider: options.computeProvider,
    storage_root: options.storageRoot,
    chain_tx: options.chainTx,
    contract_address: options.contractAddress,
    proof_id: options.proofId,
    explorer_link: options.explorerLink,
    created_at: formatCreatedAt(options.createdAt),
  });
}

export async function uploadProofBundleTo0G(
  bundle: ProofBundle,
  options: UploadProofBundleTo0GOptions,
): Promise<UploadProofBundleTo0GResult> {
  const key = options.key ?? proofBundleKey(bundle, options.namespace);
  const payload = serializeProofBundle(bundle);
  const result = await options.client.putObject(key, payload);
  const storageRoot = extractStorageRoot(result.reference) ?? hashJson({ key, payload });
  const uploadedBundle = { ...bundle, storage_root: storageRoot };

  return {
    storageRoot,
    uri: result.reference,
    bundle: uploadedBundle,
  };
}

export function localProofBundleObjectClient(): OgObjectClient {
  return memoryOgObjectClient();
}

export function proofBundleKey(bundle: ProofBundle, namespace = 'agentproof'): string {
  return `${namespace}/proof-bundles/${bundle.task_id}.json`;
}

export function serializeProofBundle(bundle: ProofBundle): string {
  return `${stableStringify(bundle)}\n`;
}

export function hashJson(value: unknown): string {
  return `sha256:${hashJsonHex(value)}`;
}

export function hashJsonHex(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function hashForBytes32(value: string): `0x${string}` {
  const hex = value.startsWith('sha256:')
    ? value.slice('sha256:'.length)
    : value.startsWith('0x')
      ? value.slice(2)
      : '';
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return `0x${hex.toLowerCase()}`;
  }

  return `0x${hashJsonHex(value)}`;
}

function hashOptionalJson(value: unknown): string | undefined {
  return value === undefined ? undefined : hashJson(value);
}

function formatCreatedAt(value: Date | string | undefined): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value ?? new Date().toISOString();
}

function extractStorageRoot(reference: string | undefined): string | undefined {
  if (reference === undefined) {
    return undefined;
  }

  const fileReference = /^0g-file:[^:]+:(.+)$/.exec(reference);
  if (fileReference?.[1] !== undefined) {
    return fileReference[1];
  }

  return /^0g-root:(.+)$/.exec(reference)?.[1];
}

type StableJson =
  | string
  | number
  | boolean
  | null
  | readonly StableJson[]
  | { readonly [key: string]: StableJson };

function stableStringify(value: unknown): string {
  return JSON.stringify(toStableJson(value));
}

function toStableJson(value: unknown): StableJson {
  if (value === undefined) {
    return null;
  }
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') {
    return { type: 'bigint', value: value.toString() };
  }
  if (value instanceof Date) {
    return { type: 'date', value: value.toISOString() };
  }
  if (value instanceof Uint8Array) {
    return { type: 'bytes', value: Buffer.from(value).toString('hex') };
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toStableJson(entry));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, toStableJson(entryValue)]),
    );
  }

  return String(value);
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)) as T;
}
