pragma solidity ^0.8.30;

import "../../libraries/EfficientLeftRightKeccak.sol";
import "../../messaging/libraries/MessageHashing.sol";

import "../ConnectorBase.sol";
import "../interfaces/IAuthParams.sol";

import "../interfaces/IConnector.sol";

import "./LineaConnector.sol";
import "./interfaces/IL2LineaConnector.sol";
import {BitMaps} from "@openzeppelin/contracts/utils/structs/BitMaps.sol";

contract LineaL2Connector is ILineaL2Connector, ConnectorBase, LineaConnector {
  using BitMaps for BitMaps.BitMap;
  using EfficientLeftRightKeccak for *;

  /// @dev The default hash value.
  bytes32 internal constant EMPTY_HASH = 0x0;

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
  uint256[50] private __gap_L1MessageManager;

  function decodeAndVerify(
    uint256 networkId,
    bytes calldata encodedInfo,
    bytes calldata encodedProof
  ) external virtual override returns (address contractAddress, bytes memory functionCallData) {

    // Receiving from a L2 Linea network requires a call to L1MessageService:claimMessageWithProof(). This will execute the call.
    // Verification requires access to a map [l2MerkleRootsDepths].
    // The map [l2MerkleRootsDepths] is updated by an external function [finalizeBlocks] invoked to finalize compressed blocks, with a proof, in the rollup contract.

    (uint256 targetNetworkId, address targetContractAddress, bytes memory msgData) = abi.decode(encodedInfo, (uint256, address, bytes));
    MessageData memory message = abi.decode(msgData, (MessageData));
    Proof memory proof = abi.decode(encodedProof, (Proof));

    uint256 merkleDepth = l2MerkleRootsDepths[proof.proof.root];

    if (merkleDepth == 0) {
      revert L2MerkleRootDoesNotExist();
    }

    if (merkleDepth != proof.proof.witnesses.length) {
      revert ProofLengthDifferentThanMerkleDepth(merkleDepth, proof.proof.witnesses.length);
    }

    _setL2L1MessageToClaimed(message.messageNumber);
    //_addUsedAmount(message.fee + message.value);

    bytes32 messageHash = this.hashMessage(message.from, message.to, message.fee, message.value, message.messageNumber, message.data);
    if (!_verifyMerkleProof(messageHash,proof.proof.witnesses,proof.proof.leafIndex,proof.proof.root)) {
      revert InvalidMerkleProof();
    }
    emit MessageClaimed(messageHash);

    contractAddress = targetContractAddress;
    functionCallData = message.data;
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
  ) external virtual payable override {
    bytes memory functionCallDataWithAuthParams = encodeAuthParams(functionCallData, this.getLocalNetworkId(), msg.sender);

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
    bytes32 messageHash = this.hashMessage(msg.sender, contractAddress, inputFee, valueSent, messageNumber, functionCallData);
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
   * @notice Checks if the L2->L1 message is claimed or not.
   * @param messageNumber The message number on L2.
   * @return isClaimed Returns whether or not the message with _messageNumber has been claimed.
   */
  function _isMessageClaimed(uint256 messageNumber) external view returns (bool isClaimed) {
    isClaimed = _messageClaimedBitMap.get(messageNumber);
  }

  /**
   * @notice Add the L2 Merkle roots to the storage.
   * @dev This function is called during block finalization.
   * @dev The _treeDepth does not need to be checked to be non-zero as it is,
   * already enforced to be non-zero in the circuit, and used in the proof's public input.
   * @param _newRoots New L2 Merkle roots.
   */
  function addL2MerkleRoots(bytes32[] calldata _newRoots, uint256 _treeDepth) external virtual override {
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
  function anchorL2MessagingBlocks(bytes calldata _l2MessagingBlocksOffsets, uint256 _currentL2BlockNumber) external virtual override {
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
   * @notice Internal function to validate L1 rolling hash.
   * @param rollingHashMessageNumber Message number associated with the rolling hash as computed on L2.
   * @param rollingHash L1 rolling hash as computed on L2.
   */
  function validateL2ComputedRollingHash(uint256 rollingHashMessageNumber, bytes32 rollingHash) external virtual view override {
    if (rollingHashMessageNumber == 0) {
      if (rollingHash != EMPTY_HASH) {
        revert MissingMessageNumberForRollingHash(rollingHash);
      }
    } else {
      if (rollingHash == EMPTY_HASH) {
        revert MissingRollingHashForMessageNumber(rollingHashMessageNumber);
      }
      if (rollingHashes[rollingHashMessageNumber] != rollingHash) {
        revert L1RollingHashDoesNotExistOnL1(rollingHashMessageNumber, rollingHash);
      }
    }
  }

  /**
   * @notice Claims and delivers a cross-chain message using a Merkle proof.
   * @dev if tree depth is empty, it will revert with L2MerkleRootDoesNotExist.
   * @dev if tree depth is different than proof size, it will revert with ProofLengthDifferentThanMerkleDepth.
   * @param _params Collection of claim data with proof and supporting data.
   */
  function claimMessageWithProof(
    ClaimMessageWithProofParams calldata _params
  ) external virtual override {//nonReentrant distributeFees(_params.fee, _params.to, _params.data, _params.feeRecipient) {
    //_claimMessageWithProof(_params);
  }

  /**
   * @notice Verify merkle proof
   * @param _leafHash Leaf hash.
   * @param _proof Sparse merkle tree proof.
   * @param _leafIndex Index of the leaf.
   * @param _root Merkle root.
   * @dev The depth of the tree is expected to be validated elsewhere beforehand.
   * @return proofIsValid Returns if the proof is valid or not.
   */
  function _verifyMerkleProof(
    bytes32 _leafHash,
    bytes32[] memory _proof,
    uint32 _leafIndex,
    bytes32 _root
  ) internal pure returns (bool proofIsValid) {
    uint32 maxAllowedIndex = _safeCastToUint32((2 ** _proof.length) - 1);

    if (_leafIndex > maxAllowedIndex) {
      revert LeafIndexOutOfBounds(_leafIndex, maxAllowedIndex);
    }

    bytes32 node = _leafHash;

    for (uint256 height; height < _proof.length; ++height) {
      if (((_leafIndex >> height) & 1) == 1) {
        node = EfficientLeftRightKeccak._efficientKeccak(_proof[height], node);
      } else {
        node = EfficientLeftRightKeccak._efficientKeccak(node, _proof[height]);
      }
    }
    proofIsValid = node == _root;
  }

  /**
   * @notice Tries to safely cast to uint32.
   * @param _value The value being cast to uint32.
   * @return castUint32 Returns a uint32 safely cast.
   * @dev This is based on OpenZeppelin's SafeCast library.
   */
  function _safeCastToUint32(uint256 _value) internal pure returns (uint32 castUint32) {
    if (_value > type(uint32).max) {
      revert SafeCastOverflowedUintDowncast(32, _value);
    }
    castUint32 = uint32(_value);
  }

}
