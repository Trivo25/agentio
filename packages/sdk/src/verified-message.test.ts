import assert from 'node:assert/strict';
import test from 'node:test';

import type { AgentMessage, CredentialProof, ProofAdapter, ProofRequest, ProofResult, VerifierResult } from '@0xagentio/core';

import { verifyMessageAction } from './verified-message.js';

const proof: CredentialProof = {
  format: 'local-test-proof',
  proof: new Uint8Array([1]),
  publicInputs: {
    agentId: 'agent-alice',
    actionType: 'request-quote',
    policyHash: 'policy-hash-1',
  },
};

const message: AgentMessage = {
  id: 'message-1',
  type: 'swap-quote-request',
  sender: 'agent-alice',
  createdAt: new Date('2026-04-25T12:00:00.000Z'),
  payload: { proof },
};

const proofAdapter: ProofAdapter = {
  async proveAction(_request: ProofRequest): Promise<ProofResult> {
    return { proof };
  },
  async verifyProof(_proof: CredentialProof): Promise<VerifierResult> {
    return { valid: true };
  },
};

test('verifyMessageAction accepts proofs with matching public inputs', async () => {
  const result = await verifyMessageAction(message, proofAdapter, {
    agentId: 'agent-alice',
    actionType: 'request-quote',
    policyHash: 'policy-hash-1',
  });

  assert.equal(result.valid, true);
});

test('verifyMessageAction rejects mismatched action public inputs', async () => {
  const result = await verifyMessageAction(message, proofAdapter, {
    agentId: 'agent-alice',
    actionType: 'swap',
    policyHash: 'policy-hash-1',
  });

  assert.equal(result.valid, false);
  assert.equal(result.reason, 'public-input-mismatch:actionType');
});
