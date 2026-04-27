import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ProofRequest } from '@0xagentio/core';
import { hashPolicy } from '@0xagentio/core';
import { buildAuthorizationCircuitInput } from './witness.js';

/**
 * Stable proof request used to generate the Noir `Prover.toml` fixture.
 *
 * Developers can run this fixture to confirm that the TypeScript witness builder
 * and the Noir circuit still agree before we wire real proof generation. It is
 * intentionally tiny and mirrors the same swap-style authorization used by the
 * local SDK tests.
 */
export function createAuthorizationFixtureRequest(): ProofRequest {
  const policy = {
    id: 'policy-noir-fixture',
    allowedActions: ['swap'],
    constraints: [
      { type: 'max-amount' as const, value: 500n, actionTypes: ['swap'] },
      { type: 'max-cumulative-amount' as const, value: 1_000n, actionTypes: ['swap'] },
    ],
    expiresAt: new Date('2026-05-01T00:00:00.000Z'),
  };

  return {
    credential: {
      id: 'credential-noir-fixture',
      agentId: 'agent-alice',
      policyId: policy.id,
      policyHash: hashPolicy(policy),
      issuedAt: new Date('2026-04-25T00:00:00.000Z'),
      expiresAt: new Date('2026-04-30T00:00:00.000Z'),
    },
    policy,
    state: {
      cumulativeSpend: 0n,
      updatedAt: new Date('2026-04-25T00:00:00.000Z'),
    },
    action: {
      type: 'swap',
      amount: 250n,
    },
    now: new Date('2026-04-25T12:00:00.000Z'),
  };
}

/**
 * Writes a `Prover.toml` file that can be executed by Nargo.
 *
 * The real Noir adapter will pass inputs in memory through NoirJS, but this file
 * gives us a simple command-line compatibility check today: build SDK input,
 * serialize it in Nargo's expected format, and let the circuit execute it.
 */
export async function writeAuthorizationProverFixture(outputPath = authorizationProverFixturePath()): Promise<void> {
  const input = buildAuthorizationCircuitInput(createAuthorizationFixtureRequest());
  const toml = `${Object.entries(input)
    .map(([key, value]) => `${key} = "${value}"`)
    .join('\n')}\n`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, toml);
}

function authorizationProverFixturePath(): string {
  return resolve('packages/noir/circuits/authorization/Prover.toml');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await writeAuthorizationProverFixture(process.argv[2]);
}
