pragma solidity ^0.8.30;

import "./ILineaConnector.sol";

interface ILineaL2Connector is ILineaConnector {


  /**
	 * @notice Emitted when a new message is sent and the rolling hash updated.
   * @param messageNumber The unique indexed message number for the message.
   * @param rollingHash The indexed rolling hash computed for the current message number.
   * @param messageHash The indexed hash of the message parameters.
   */
  event RollingHashUpdated(uint256 indexed messageNumber, bytes32 indexed rollingHash, bytes32 indexed messageHash);

  /**
   * @notice Emitted when the L2 Merkle root has been anchored on L1.
   * @param l2MerkleRoot The indexed L2 Merkle root that has been anchored on L1 Ethereum.
   * @param treeDepth The indexed tree depth of the Merkle root.
   * @dev There may be more than one of these in a finalization depending on the amount of L2->L1 messages in the finalization.
   */
  event L2MerkleRootAdded(bytes32 indexed l2MerkleRoot, uint256 indexed treeDepth);

  /**
   * @notice Emitted when the L2 block contains L2 messages during finalization.
   * @param l2Block The indexed L2 block containing L2 to L1 messages.
   * @dev This is used externally in the logic for determining which messages belong to which Merkle root when claiming.
   */
  event L2MessagingBlockAnchored(uint256 indexed l2Block);

  /* @dev Thrown when the message has already been claimed. */
  error MessageAlreadyClaimed(uint256 messageIndex);

  /* @dev Thrown when the L2 Merkle root has already been anchored on L1. */
  error L2MerkleRootAlreadyAnchored(bytes32 merkleRoot);

  /* @dev Thrown when the L2 messaging blocks offsets bytes length is not a multiple of 2. */
  error BytesLengthNotMultipleOfTwo(uint256 bytesLength);

  /* @dev Thrown when finalizationData.l1RollingHash does not exist on L1 (Feedback loop). */
  error L1RollingHashDoesNotExistOnL1(uint256 messageNumber, bytes32 rollingHash);

  /* @dev Thrown when a rolling hash is provided without a corresponding message number. */
  error MissingMessageNumberForRollingHash(bytes32 rollingHash);

  /* @dev Thrown when a message number is provided without a corresponding rolling hash. */
  error MissingRollingHashForMessageNumber(uint256 messageNumber);

  /* @dev Thrown when L2 Merkle root does not exist. */
  error L2MerkleRootDoesNotExist();

  /* @dev Thrown when the Merkle proof is invalid. */
  error InvalidMerkleProof();

  /* @dev Thrown when Merkle depth doesn't match proof length. */
  error ProofLengthDifferentThanMerkleDepth(uint256 actual, uint256 expected);
}
