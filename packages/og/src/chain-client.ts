import { ethers } from 'ethers';

import { hashForBytes32, hashJson } from './proof-bundle.js';

export const AGENT_PROOF_REGISTRY_ABI = [
  'event ProofAnchored(uint256 indexed proofId,address indexed submitter,bytes32 taskHash,bytes32 evidenceHash,bytes32 resultHash,string storageRoot,uint256 timestamp)',
  'function anchorProof(bytes32 taskHash,bytes32 evidenceHash,bytes32 resultHash,string storageRoot) external returns (uint256 proofId)',
  'function proofCount() external view returns (uint256)',
  'function proofs(uint256 proofId) external view returns (address submitter,bytes32 taskHash,bytes32 evidenceHash,bytes32 resultHash,string storageRoot,uint256 timestamp)',
] as const;

export type AnchorProofOn0GOptions = {
  readonly rpcUrl: string;
  readonly privateKey: string;
  readonly contractAddress: string;
  readonly taskHash: string;
  readonly evidenceHash: string;
  readonly resultHash: string;
  readonly storageRoot: string;
  readonly explorerBaseUrl?: string;
  readonly confirmations?: number;
};

export type AnchorProofOn0GResult = {
  readonly txHash: string;
  readonly proofId?: string;
  readonly contractAddress: string;
  readonly explorerLink?: string;
};

export async function anchorProofOn0G(options: AnchorProofOn0GOptions): Promise<AnchorProofOn0GResult> {
  const provider = new ethers.JsonRpcProvider(options.rpcUrl);
  const signer = new ethers.Wallet(options.privateKey, provider);
  const registry = new ethers.Contract(options.contractAddress, AGENT_PROOF_REGISTRY_ABI, signer);

  const tx = await registry.anchorProof(
    hashForBytes32(options.taskHash),
    hashForBytes32(options.evidenceHash),
    hashForBytes32(options.resultHash),
    options.storageRoot,
  );
  const receipt = await tx.wait(options.confirmations ?? 1);
  const proofId = readProofId(registry.interface, receipt?.logs ?? []);

  return {
    txHash: tx.hash,
    proofId,
    contractAddress: options.contractAddress,
    explorerLink: formatExplorerLink(options.explorerBaseUrl, tx.hash),
  };
}

export function createLocalAnchorProofReceipt(options: {
  readonly contractAddress?: string;
  readonly taskHash: string;
  readonly evidenceHash: string;
  readonly resultHash: string;
  readonly storageRoot: string;
  readonly explorerBaseUrl?: string;
}): AnchorProofOn0GResult {
  const txHash = hashForBytes32(hashJson(options));

  return {
    txHash,
    proofId: 'local-preview-1',
    contractAddress: options.contractAddress ?? '0x0000000000000000000000000000000000000000',
    explorerLink: formatExplorerLink(options.explorerBaseUrl, txHash),
  };
}

type ProofLog = {
  readonly topics: readonly string[];
  readonly data: string;
};

function readProofId(contractInterface: ethers.Interface, logs: readonly ProofLog[]): string | undefined {
  for (const log of logs) {
    try {
      const parsed = contractInterface.parseLog(log);
      if (parsed?.name === 'ProofAnchored') {
        return parsed.args.proofId.toString();
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function formatExplorerLink(explorerBaseUrl: string | undefined, txHash: string): string | undefined {
  if (explorerBaseUrl === undefined || explorerBaseUrl === '') {
    return undefined;
  }

  return `${explorerBaseUrl.replace(/\/$/, '')}/tx/${txHash}`;
}
