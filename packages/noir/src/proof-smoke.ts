import { createAuthorizationFixtureRequest } from './fixture.js';
import { noirProofs } from './adapter.js';

/**
 * Runs one real Noir proof generation and verification cycle.
 *
 * This is intentionally kept out of the default unit test suite because
 * Barretenberg proof generation is heavier than normal SDK tests. Run
 * `npm run noir:proof-smoke` when changing the real adapter, artifact loader,
 * witness builder, or circuit.
 */
export async function runNoirProofSmoke(): Promise<void> {
  const adapter = noirProofs();
  const result = await adapter.proveAction(createAuthorizationFixtureRequest());
  const verification = await adapter.verifyProof(result.proof);

  if (!verification.valid) {
    throw new Error(`Noir proof smoke verification failed: ${verification.reason ?? 'unknown reason'}`);
  }

  console.log(`Noir proof smoke verified ${result.proof.format} (${result.proof.proof.length} encoded bytes).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runNoirProofSmoke();
}
