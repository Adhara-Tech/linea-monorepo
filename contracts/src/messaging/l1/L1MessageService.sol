// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.30;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { L1MessageServiceV1 } from "./v1/L1MessageServiceV1.sol";
import { L1MessageManager } from "./L1MessageManager.sol";
import { IL1MessageService } from "./interfaces/IL1MessageService.sol";
import { IGenericErrors } from "../../interfaces/IGenericErrors.sol";
import { SparseMerkleTreeVerifier } from "../libraries/SparseMerkleTreeVerifier.sol";
import { MessageHashing } from "../libraries/MessageHashing.sol";

/**
 * @title Contract to manage cross-chain messaging on L1.
 * @author ConsenSys Software Inc.
 * @custom:security-contact security-report@linea.build
 */
abstract contract L1MessageService is
  AccessControlUpgradeable,
  L1MessageServiceV1,
  L1MessageManager,
  IL1MessageService,
  IGenericErrors
{
  using SparseMerkleTreeVerifier for *;
  using MessageHashing for *;

  /// @dev This is currently not in use, but is reserved for future upgrades.
  uint256 public systemMigrationBlock;

  /// @dev Total contract storage is 51 slots including the gap below.
  /// @dev Keep 50 free storage slots for future implementation updates to avoid storage collision.
  uint256[50] private __gap_L1MessageService;

  /**
   * @notice Initialises underlying message service dependencies.
   * @param _rateLimitPeriod The period to rate limit against.
   * @param _rateLimitAmount The limit allowed for withdrawing the period.
   */
  function __MessageService_init(uint256 _rateLimitPeriod, uint256 _rateLimitAmount) internal onlyInitializing {
    __ERC165_init();
    __Context_init();
    __AccessControl_init();
    __RateLimiter_init(_rateLimitPeriod, _rateLimitAmount);

    nextMessageNumber = 1;
  }

  /**
   * @notice Add the L2 Merkle roots to the storage.
   * @dev This function is called during block finalization.
   * @dev The _treeDepth does not need to be checked to be non-zero as it is,
   * already enforced to be non-zero in the circuit, and used in the proof's public input.
   * @param _newRoots New L2 Merkle roots.
   */
  function addL2MerkleRoots(bytes32[] calldata _newRoots, uint256 _treeDepth) external virtual override {
    _addL2MerkleRoots(_newRoots, _treeDepth);
  }

  /**
   * @notice Emit an event for each L2 block containing L2->L1 messages.
   * @dev This function is called during block finalization.
   * @param _l2MessagingBlocksOffsets Is a sequence of uint16 values, where each value plus the last finalized L2 block number.
   * indicates which L2 blocks have L2->L1 messages.
   * @param _currentL2BlockNumber Last L2 block number finalized on L1.
   */
  function anchorL2MessagingBlocks(bytes calldata _l2MessagingBlocksOffsets, uint256 _currentL2BlockNumber) external virtual override {
    _anchorL2MessagingBlocks(_l2MessagingBlocksOffsets, _currentL2BlockNumber);
  }

  /**
   * @notice Internal function to validate l1 rolling hash.
   * @param _rollingHashMessageNumber Message number associated with the rolling hash as computed on L2.
   * @param _rollingHash L1 rolling hash as computed on L2.
   */
  function validateL2ComputedRollingHash(uint256 _rollingHashMessageNumber, bytes32 _rollingHash) external virtual view override {
    _validateL2ComputedRollingHash(_rollingHashMessageNumber, _rollingHash);
  }

  /**
   * @notice Adds a message for sending cross-chain and emits MessageSent.
   * @dev The message number is preset (nextMessageNumber) and only incremented at the end if successful for the next caller.
   * @dev This function should be called with a msg.value = _value + _fee. The fee will be paid on the destination chain.
   * @param _to The address the message is intended for.
   * @param _fee The fee being paid for the message delivery.
   * @param _calldata The calldata to pass to the recipient.
   */
  function sendMessage(
    address _to,
    uint256 _fee,
    bytes calldata _calldata
  ) external payable virtual whenTypeAndGeneralNotPaused(PauseType.L1_L2) {
    _sendMessage(_to, _fee, _calldata);
  }

  /**
   * @notice Adds a message for sending cross-chain and emits MessageSent.
   * @param _to The address the message is intended for.
   * @param _fee The fee being paid for the message delivery.
   * @param _calldata The calldata to pass to the recipient.
   */
  function _sendMessage(address _to, uint256 _fee, bytes calldata _calldata) internal virtual {
    if (_to == address(0)) {
      revert ZeroAddressNotAllowed();
    }

    if (_fee > msg.value) {
      revert ValueSentTooLow();
    }

    uint256 messageNumber = nextMessageNumber++;
    uint256 valueSent = msg.value - _fee;

    bytes32 messageHash = MessageHashing._hashMessage(msg.sender, _to, _fee, valueSent, messageNumber, _calldata);

    _addRollingHash(messageNumber, messageHash);

    emit MessageSent(msg.sender, _to, _fee, valueSent, messageNumber, _calldata, messageHash);
  }

  /**
   * @notice Claims and delivers a cross-chain message using a Merkle proof.
   * @dev if tree depth is empty, it will revert with L2MerkleRootDoesNotExist.
   * @dev if tree depth is different than proof size, it will revert with ProofLengthDifferentThanMerkleDepth.
   * @param _params Collection of claim data with proof and supporting data.
   */
  function claimMessageWithProof(
    ClaimMessageWithProofParams calldata _params
  ) external virtual nonReentrant distributeFees(_params.fee, _params.to, _params.data, _params.feeRecipient) {
    _claimMessageWithProof(_params);
  }

  /**
   * @notice Claims and delivers a cross-chain message using a Merkle proof.
   * @param _params Collection of claim data with proof and supporting data.
   */
  function _claimMessageWithProof(ClaimMessageWithProofParams calldata _params) internal virtual {
    _requireTypeAndGeneralNotPaused(PauseType.L2_L1);

    uint256 merkleDepth = l2MerkleRootsDepths[_params.merkleRoot];

    if (merkleDepth == 0) {
      revert L2MerkleRootDoesNotExist();
    }

    if (merkleDepth != _params.proof.length) {
      revert ProofLengthDifferentThanMerkleDepth(merkleDepth, _params.proof.length);
    }

    _setL2L1MessageToClaimed(_params.messageNumber);

    _addUsedAmount(_params.fee + _params.value);

    bytes32 messageLeafHash = MessageHashing._hashMessage(
      _params.from,
      _params.to,
      _params.fee,
      _params.value,
      _params.messageNumber,
      _params.data
    );
    if (
      !SparseMerkleTreeVerifier._verifyMerkleProof(
        messageLeafHash,
        _params.proof,
        _params.leafIndex,
        _params.merkleRoot
      )
    ) {
      revert InvalidMerkleProof();
    }

    TRANSIENT_MESSAGE_SENDER = _params.from;

    (bool callSuccess, bytes memory returnData) = _params.to.call{ value: _params.value }(_params.data);
    if (!callSuccess) {
      if (returnData.length > 0) {
        assembly {
          let data_size := mload(returnData)
          revert(add(0x20, returnData), data_size)
        }
      } else {
        revert MessageSendingFailed(_params.to);
      }
    }

    TRANSIENT_MESSAGE_SENDER = DEFAULT_MESSAGE_SENDER_TRANSIENT_VALUE;

    emit MessageClaimed(messageLeafHash);
  }

  /**
   * @notice Claims and delivers a cross-chain message.
   * @dev The message sender address is set temporarily in the transient storage when claiming.
   * @return originalSender The message sender address that is stored temporarily in the transient storage when claiming.
   */
  function sender() external view virtual returns (address originalSender) {
    originalSender = TRANSIENT_MESSAGE_SENDER;
  }
}
