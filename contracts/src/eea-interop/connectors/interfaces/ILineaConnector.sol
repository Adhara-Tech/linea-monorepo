pragma solidity ^0.8.30;

//import "../../libraries/EfficientLeftRightKeccak.sol";

interface ILineaConnector  {

  //  struct ClaimMessageWithProofParams {
  //    bytes32[] proof;
  //    uint256 messageNumber;
  //    uint32 leafIndex;
  //    address from;
  //    address to;
  //    uint256 fee;
  //    uint256 value;
  //    address payable feeRecipient;
  //    bytes32 merkleRoot;
  //    bytes data;
  //  }

  // Structure to hold Merkle proof data.
  struct ProofData {
    bytes32 root;  // ClaimMessageWithProofParams.merkleRoot
    uint32 leafIndex; // ClaimMessageWithProofParams.leafIndex
    bytes32[] witnesses; // ClaimMessageWithProofParams.proof
  }

  // Structure to hold message data in encoded info.
  struct MessageData {
    address from;
    address to;
    uint256 fee;
    uint256 value;
    bytes data; // ClaimMessageWithProofParams.data
    uint256 messageNumber; // ClaimMessageWithProofParams.messageNumber
    address payable feeRecipient;
  }

  // Structure to hold a signature.
  struct Signature {
    uint256 by;
    uint256 sigR;
    uint256 sigS;
    uint256 sigV;
    bytes meta;
  }

  // Structure to hold proof data and signatures
  struct Proof {
    uint256 typ;
    ProofData proof;
    Signature[] signatures;
  }

  /**
   * @notice Emitted when a message is sent.
   * @param from The indexed sender address of the message (msg.sender).
   * @param to The indexed intended recipient address of the message on the other layer.
   * @param fee The fee being being paid to deliver the message to the recipient in Wei.
   * @param value The value being sent to the recipient in Wei.
   * @param messageNumber The unique message number.
   * @param callData The call data being passed to the intended recipient when being called on claiming.
   * @param messageHash The indexed hash of the message parameters.
   * @dev calldata has the  because calldata is a reserved word.
   * @dev We include the message hash to save hashing costs on the rollup.
   * @dev This event is used on both L1 and L2.
   */
  event MessageSent(address indexed from, address indexed to, uint256 fee, uint256 value, uint256 messageNumber, bytes callData, bytes32 indexed messageHash);

  /**
   * @notice Emitted when a message is claimed.
   * @param messageHash The indexed hash of the message that was claimed.
   */
  event MessageClaimed(bytes32 indexed messageHash);

  /* @dev Thrown when fees are lower than the minimum fee. */
  error FeeTooLow();

  /* @dev Thrown when the value sent is less than the fee. Value to forward on is msg.value - fee. */
  error ValueSentTooLow();

  /* @dev Thrown when the destination address reverts. */
  error MessageSendingFailed(address destination);

  /* @dev Thrown when the recipient address reverts. */
  error FeePaymentFailed(address recipient);

  /* @dev Thrown when a parameter is the zero address. */
  error ZeroAddressNotAllowed();

  /* @dev Thrown when a parameter is the zero hash. */
  error ZeroHashNotAllowed();

  /**
   * @dev Value doesn't fit in a uint of `bits` size.
   * @dev This is based on OpenZeppelin's SafeCast library.
   */
  error SafeCastOverflowedUintDowncast(uint8 bits, uint256 value);

  /**
   * @dev Custom error for when the leaf index is out of bounds.
   */
  error LeafIndexOutOfBounds(uint32 leafIndex, uint32 maxAllowedIndex);

}
