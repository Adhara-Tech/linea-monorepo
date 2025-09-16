pragma solidity ^0.8.30;

import "../../libraries/EfficientLeftRightKeccak.sol";
import "../../messaging/libraries/MessageHashing.sol";

import "../ConnectorBase.sol";

import "../interfaces/IAuthParams.sol";
import "../interfaces/IConnector.sol";

import "./interfaces/IL2LineaConnector.sol";

import {BitMaps} from "@openzeppelin/contracts/utils/structs/BitMaps.sol";

contract LineaL2Connector is ILineaL2Connector, ConnectorBase {
  using BitMaps for BitMaps.BitMap;
  using EfficientLeftRightKeccak for *;

  // @notice Initialize minimumFeeInWei variable.
  uint256 public minimumFeeInWei;

  // @dev This is initialised to save user cost with existing slot.
  uint256 public nextMessageNumber;

  // @notice Contains the L1 to L2 messaging rolling hashes mapped to message number computed on L1.
  mapping(uint256 messageNumber => bytes32 rollingHash) public rollingHashes;

  // @notice This maps which message numbers have been claimed to prevent duplicate claiming.
  BitMaps.BitMap internal _messageClaimedBitMap;

  // @notice Contains the L2 messages Merkle roots mapped to their tree depth.
  mapping(bytes32 merkleRoot => uint256 treeDepth) public l2MerkleRootsDepths;

  // @dev Total contract storage is 53 slots including the gap below.
  // @dev Keep 50 free storage slots for future implementation updates to avoid storage collision.
  //uint256[50] private __gap_L1MessageManager;

  function decodeAndVerify(
    uint256 networkId,
    bytes calldata encodedInfo,
    bytes calldata encodedProof
  ) external view virtual override returns (address contractAddress, bytes memory functionCallData) {
    contractAddress = address(0);
    functionCallData = "0x";

    // Receiving from a L2 Linea network requires a call to L1MessageService:claimMessageWithProof(). This will execute the call.
    // Verification requires access to a map [l2MerkleRootsDepths].
    // The map [l2MerkleRootsDepths] is updated by an external function [finalizeBlocks] invoked to finalize compressed blocks, with a proof, in the rollup contract.
  }

  function authenticateHiddenAuthParams(
    address contractAddress,
    bytes memory functionCallData
  ) external view virtual override returns (bool) {
    (uint256 networkId, address authAddress) = decodeAuthParamsFromParameter(functionCallData);
    return true;
  }

  function updateAndCommit(
    uint256 networkId,
    address contractAddress,
    bytes calldata functionCallData
  ) external virtual override {
    bytes memory functionCallDataWithAuthParams = encodeAuthParams(localNetworkId, msg.sender, functionCallData);

    // Sending to a L2 Linea network requires a call to L1MessageService:sendMessage(targetContractAddress,fee,functionCallData), embedded in the rollup contract on L1.
    // Update the map [rollingHashes] via the function [_addRollingHash] that is used when messages are anchored on L2 by a trusted coordinator.

    uint256 inputFee = minimumFeeInWei; // TODO: How to take fee input

    if (contractAddress == address(0)) {
      revert ZeroAddressNotAllowed();
    }
    if (inputFee > msg.value) {
      revert ValueSentTooLow();
    }
    uint256 messageNumber = nextMessageNumber++;
    uint256 valueSent = msg.value - inputFee;
    bytes32 messageHash = MessageHashing._hashMessage(msg.sender, contractAddress, inputFee, valueSent, messageNumber, functionCallData);
    _addRollingHash(messageNumber, messageHash);
    emit MessageSent(msg.sender, contractAddress, inputFee, valueSent, messageNumber, functionCallData, messageHash);
  }

  /**
   * @notice Take an existing message hash, calculates the rolling hash and stores at the message number.
   * @param _messageNumber The current message number being sent.
   * @param _messageHash The hash of the message being sent.
   */
  function _addRollingHash(uint256 _messageNumber, bytes32 _messageHash) internal {
    unchecked {
      bytes32 newRollingHash = EfficientLeftRightKeccak._efficientKeccak(
        rollingHashes[_messageNumber - 1],
        _messageHash
      );
      rollingHashes[_messageNumber] = newRollingHash;
      emit RollingHashUpdated(_messageNumber, newRollingHash, _messageHash);
    }
  }

  /**
   * @notice Set the L2->L1 message as claimed when a user claims a message on L1.
   * @param  _messageNumber The message number on L2.
   */
  function _setL2L1MessageToClaimed(uint256 _messageNumber) internal {
    if (_messageClaimedBitMap.get(_messageNumber)) {
      revert MessageAlreadyClaimed(_messageNumber);
    }
    _messageClaimedBitMap.set(_messageNumber);
  }

  /**
   * @notice Add the L2 Merkle roots to the storage.
   * @dev This function is called during block finalization.
   * @dev The _treeDepth does not need to be checked to be non-zero as it is,
   * already enforced to be non-zero in the circuit, and used in the proof's public input.
   * @param _newRoots New L2 Merkle roots.
   */
  function _addL2MerkleRoots(bytes32[] calldata _newRoots, uint256 _treeDepth) internal {
    for (uint256 i; i < _newRoots.length; ++i) {
      if (l2MerkleRootsDepths[_newRoots[i]] != 0) {
        revert L2MerkleRootAlreadyAnchored(_newRoots[i]);
      }
      l2MerkleRootsDepths[_newRoots[i]] = _treeDepth;
      emit L2MerkleRootAdded(_newRoots[i], _treeDepth);
    }
  }

  /**
   * @notice Emit an event for each L2 block containing L2->L1 messages.
   * @dev This function is called during block finalization.
   * @param _l2MessagingBlocksOffsets Is a sequence of uint16 values, where each value plus the last finalized L2 block number.
   * indicates which L2 blocks have L2->L1 messages.
   * @param _currentL2BlockNumber Last L2 block number finalized on L1.
   */
  function _anchorL2MessagingBlocks(bytes calldata _l2MessagingBlocksOffsets, uint256 _currentL2BlockNumber) internal {
    if (_l2MessagingBlocksOffsets.length % 2 != 0) {
      revert BytesLengthNotMultipleOfTwo(_l2MessagingBlocksOffsets.length);
    }
    uint256 l2BlockOffset;
    unchecked {
      for (uint256 i; i < _l2MessagingBlocksOffsets.length; ) {
        assembly {
          l2BlockOffset := shr(240, calldataload(add(_l2MessagingBlocksOffsets.offset, i)))
        }
        emit L2MessagingBlockAnchored(_currentL2BlockNumber + l2BlockOffset);
        i += 2;
      }
    }
  }

  /**
   * @notice Checks if the L2->L1 message is claimed or not.
   * @param _messageNumber The message number on L2.
   * @return isClaimed Returns whether or not the message with _messageNumber has been claimed.
   */
  function isMessageClaimed(uint256 _messageNumber) external view returns (bool isClaimed) {
    isClaimed = _messageClaimedBitMap.get(_messageNumber);
  }
}
