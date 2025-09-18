// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

/**
 * @title L1 Message Service interface for pre-existing functions, events, structs and errors.
 * @author ConsenSys Software Inc.
 * @custom:security-contact security-report@linea.build
 */

interface IL1MessageService {

  /**
   * @notice Add the L2 Merkle roots to the storage. This function is called during block finalization.
   * @notice The indexed tree depth does not need to be checked to be non-zero as it is, already enforced to be non-zero in the circuit, and used in the proof's public input.
   * @param treeDepth The indexed tree depth of the Merkle root.
   * @param newRoots New L2 Merkle roots.
   */
  function addL2MerkleRoots(bytes32[] calldata newRoots, uint256 treeDepth) external;

  /**
   * @notice Emit an event for each L2 block containing L2->L1 messages. This function is called during block finalization.
   * @param l2MessagingBlocksOffsets Is a sequence of uint16 values, where each value plus the last finalized L2 block number indicates which L2 blocks have L2->L1 messages.
   * @param currentL2BlockNumber Last L2 block number finalized on L1.
   */
  function anchorL2MessagingBlocks(bytes calldata l2MessagingBlocksOffsets, uint256 currentL2BlockNumber) external;

  /**
   * @notice Internal function to validate L1 rolling hash.
   * @param rollingHashMessageNumber Message number associated with the rolling hash as computed on L2.
   * @param rollingHash L1 rolling hash as computed on L2.
   */
  function validateL2ComputedRollingHash(uint256 rollingHashMessageNumber, bytes32 rollingHash) external view;

  /**
   * @param proof The Merkle proof array related to the claimed message.
   * @param messageNumber The message number of the claimed message.
   * @param leafIndex The leaf index related to the Merkle proof of the message.
   * @param from The address of the original sender.
   * @param to The address the message is intended for.
   * @param fee The fee being paid for the message delivery.
   * @param value The value to be transferred to the destination address.
   * @param feeRecipient The recipient for the fee.
   * @param merkleRoot The Merkle root of the claimed message.
   * @param data The calldata to pass to the recipient.
   */
  struct ClaimMessageWithProofParams {
    bytes32[] proof;
    uint256 messageNumber;
    uint32 leafIndex;
    address from;
    address to;
    uint256 fee;
    uint256 value;
    address payable feeRecipient;
    bytes32 merkleRoot;
    bytes data;
  }

  /**
   * @dev Thrown when L2 Merkle root does not exist.
   */
  error L2MerkleRootDoesNotExist();

  /**
   * @dev Thrown when the Merkle proof is invalid.
   */
  error InvalidMerkleProof();

  /**
   * @dev Thrown when Merkle depth doesn't match proof length.
   */
  error ProofLengthDifferentThanMerkleDepth(uint256 actual, uint256 expected);

  /**
   * @notice Claims and delivers a cross-chain message using a Merkle proof.
   * @dev if tree depth is empty, it will revert with L2MerkleRootDoesNotExist.
   * @dev if tree depth is different than proof size, it will revert with ProofLengthDifferentThanMerkleDepth.
   * @param _params Collection of claim data with proof and supporting data.
   */
  function claimMessageWithProof(ClaimMessageWithProofParams calldata _params) external;
}
