// this file is intentionally non-runnable until the sdk helpers are implemented.
// it keeps the target public api visible while we build the underlying modules.

async function targetDeveloperExperience() {
  const agent = await createTrustedAgent({
    identity,
    credential,
    policy,
    state,
    reasoning: dcaReasoningEngine({
      actionType: 'swap',
      amount: 250n,
      assetPair: 'ETH/USDC',
    }),
    proof: localPolicyProofs(),
    storage: localMemoryStorage(),
  });

  return agent.startOnce();
}

void targetDeveloperExperience;

declare const identity: unknown;
declare const credential: unknown;
declare const policy: unknown;
declare const state: unknown;
declare function createTrustedAgent(options: unknown): Promise<{ startOnce(): Promise<unknown> }>;
declare function dcaReasoningEngine(options: unknown): unknown;
declare function localPolicyProofs(): unknown;
declare function localMemoryStorage(): unknown;
