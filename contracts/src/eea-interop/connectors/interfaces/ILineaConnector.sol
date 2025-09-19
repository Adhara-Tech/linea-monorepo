pragma solidity ^0.8.30;

import {IMessageService} from "../../../messaging/interfaces/IMessageService.sol";

interface ILineaConnector is IMessageService {

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
