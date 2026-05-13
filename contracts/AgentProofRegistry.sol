// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AgentProofRegistry
/// @notice Minimal registry for anchoring verifiable agent execution receipts on 0G Chain.
contract AgentProofRegistry {
    struct ProofRecord {
        address submitter;
        bytes32 taskHash;
        bytes32 evidenceHash;
        bytes32 resultHash;
        string storageRoot;
        uint256 timestamp;
    }

    uint256 public proofCount;
    mapping(uint256 => ProofRecord) public proofs;

    event ProofAnchored(
        uint256 indexed proofId,
        address indexed submitter,
        bytes32 taskHash,
        bytes32 evidenceHash,
        bytes32 resultHash,
        string storageRoot,
        uint256 timestamp
    );

    function anchorProof(
        bytes32 taskHash,
        bytes32 evidenceHash,
        bytes32 resultHash,
        string calldata storageRoot
    ) external returns (uint256 proofId) {
        proofId = ++proofCount;

        proofs[proofId] = ProofRecord({
            submitter: msg.sender,
            taskHash: taskHash,
            evidenceHash: evidenceHash,
            resultHash: resultHash,
            storageRoot: storageRoot,
            timestamp: block.timestamp
        });

        emit ProofAnchored(
            proofId,
            msg.sender,
            taskHash,
            evidenceHash,
            resultHash,
            storageRoot,
            block.timestamp
        );
    }
}
