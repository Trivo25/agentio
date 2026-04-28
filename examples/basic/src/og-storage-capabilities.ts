import {
  memoryOgObjectClient,
  ogStorage,
  supportsDurableOgState,
  type OgObjectClient,
} from '@0xagentio/og';

/**
 * Demonstrates how applications can choose a 0G storage backend by capability.
 *
 * The agent runtime only needs the generic `ogStorage()` adapter, but the
 * object client underneath may have very different guarantees. This example
 * shows the decision point developers should make before using a backend for
 * long-lived agent state.
 */

const demoClient = memoryOgObjectClient();

const storage = createAgentStorage({
  client: demoClient,
  namespace: 'agentio-capability-example',
  requireDurableState: false,
});

console.log('Created storage adapter for a short-running demo.');
console.log(`Durable after restart: ${supportsDurableOgState(demoClient) ? 'yes' : 'no'}`);
console.log(`Capabilities: ${(demoClient.capabilities ?? []).join(', ')}`);
console.log(`Storage adapter ready: ${storage !== undefined ? 'yes' : 'no'}`);

/**
 * Creates an SDK storage adapter after checking whether the backend is safe for
 * the desired runtime model.
 *
 * Short-running demos can use memory or file-backed storage. Long-lived agents
 * should require durable key reads so state can be loaded after a process
 * restart.
 */
function createAgentStorage(options: {
  readonly client: OgObjectClient;
  readonly namespace: string;
  readonly requireDurableState: boolean;
}) {
  if (options.requireDurableState && !supportsDurableOgState(options.client)) {
    throw new Error('This agent needs durable 0G state; use a synced KV client.');
  }

  return ogStorage({ namespace: options.namespace, client: options.client });
}
