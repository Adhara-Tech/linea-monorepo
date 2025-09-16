pragma solidity ^0.8.30;

import "../ConnectorBase.sol";

import "../interfaces/IAuthParams.sol";
import "../interfaces/IConnector.sol";

import "./interfaces/IL1LineaConnector.sol";

import "../../messaging/libraries/MessageHashing.sol";
import "../../../libraries/EfficientLeftRightKeccak.sol";

contract LineaL1Connector is ILineaL1Connector, ConnectorBase {

  // @notice Initialize minimumFeeInWei variable.
  uint256 public minimumFeeInWei;

  // @notice Initialize to save user cost with existing slot.
  uint256 public nextMessageNumber;

  // @notice Contains the last L1 message number anchored on L2.
  uint256 public lastAnchoredL1MessageNumber;

  /* @notice Contains the L1 to L2 messaging rolling hashes mapped to message number computed on L2. */
  mapping(uint256 messageNumber => bytes32 rollingHash) public l1RollingHashes;

  /* @notice The 3 status constants for L1 to L2 message statuses. */
  uint8 public constant INBOX_STATUS_UNKNOWN = 0;
  uint8 public constant INBOX_STATUS_RECEIVED = 1;
  uint8 public constant INBOX_STATUS_CLAIMED = 2;

  /* @dev Mapping to store L1->L2 message hashes status: messageHash => messageStatus (0: unknown, 1: received, 2: claimed). */
  mapping(bytes32 messageHash => uint256 messageStatus) public inboxL1L2MessageStatus;

  function decodeAndVerify(
    uint256 networkId,
    bytes calldata encodedInfo,
    bytes calldata encodedProof
  ) external view virtual override returns (address contractAddress, bytes memory functionCallData) {
    contractAddress = address(0);
    functionCallData = "0x";

    // Receiving from a L1 Linea anchor network requires a call to L2MessageService:claimMessage(). This will execute the call.
    // Verification requires access to a map [inboxL1L2MessageStatus].
    // The map [inboxL1L2MessageStatus] is updated by an external function [anchorL1L2MessageHashes] invoked by a trusted party to anchor L1 [rollingHashes] on L2.
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

    // Sending to a L1 Linea anchor network requires a call to L2MessageService:sendMessage(targetContractAddress,fee,functionCallData), a separate contract on L2.
    // Increment [nextMessageNumber], handle fees and emits a [MessageSent] event.

    uint256 inputFee = minimumFeeInWei; // TODO: How to take fee input
    if (contractAddress == address(0)) {
      revert ZeroAddressNotAllowed();
    }
    if (inputFee > msg.value) {
      revert ValueSentTooLow();
    }
    uint256 coinbaseFee = minimumFeeInWei;
    if (inputFee < coinbaseFee) {
      revert FeeTooLow();
    }

    uint256 relayerFee = inputFee - coinbaseFee;
    uint256 valueSent = msg.value - inputFee;
    uint256 messageNumber = nextMessageNumber++;

    // Rate limit and revert is in the rate limiter.
    //_addUsedAmount(valueSent + relayerFee);

    bytes32 messageHash = MessageHashing._hashMessage(msg.sender, contractAddress, relayerFee, valueSent, messageNumber, functionCallDataWithAuthParams);
    emit MessageSent(msg.sender, contractAddress, relayerFee, valueSent, messageNumber, functionCallDataWithAuthParams, messageHash);

    // Pay minimum fees.
    (bool success, ) = block.coinbase.call{ value: coinbaseFee }("");
    if (!success) {
      revert FeePaymentFailed(block.coinbase);
    }
  }

  /**
	 * @notice Add cross-chain L1->L2 message hashes in storage.
   * @dev Only address that has the correct role are allowed to call this function.
   * @dev Note that in the unlikely event of a duplicate anchoring, the lastAnchoredL1MessageNumber MUST NOT be incremented,
   * @dev and the rolling hash not calculated, else synchronisation will break.
   * @dev If starting number is zero, an underflow error is expected.
   * @param messageHashes New message hashes to anchor on L2.
   * @param startingMessageNumber The expected L1 message number to start when anchoring.
   * @param finalMessageNumber The expected L1 message number to end on when anchoring.
   * @param finalRollingHash The expected L1 rolling hash to end on when anchoring.
   */
  function anchorL1L2MessageHashes(
    bytes32[] calldata messageHashes,
    uint256 startingMessageNumber,
    uint256 finalMessageNumber,
    bytes32 finalRollingHash
  ) external {
    if (messageHashes.length == 0) {
      revert MessageHashesListLengthIsZero();
    }
    if (messageHashes.length > 100) {
      revert MessageHashesListLengthHigherThanOneHundred(messageHashes.length);
    }
    if (finalRollingHash == 0x0) {
      revert FinalRollingHashIsZero();
    }

    uint256 currentL1MessageNumber = lastAnchoredL1MessageNumber;
    if (startingMessageNumber - 1 != currentL1MessageNumber) {
      revert L1MessageNumberSynchronizationWrong(startingMessageNumber - 1, currentL1MessageNumber);
    }

    bytes32 rollingHash = l1RollingHashes[currentL1MessageNumber];
    bytes32 messageHash;
    for (uint256 i; i < messageHashes.length; ++i) {
      messageHash = messageHashes[i];
      if (inboxL1L2MessageStatus[messageHash] == INBOX_STATUS_UNKNOWN) {
        inboxL1L2MessageStatus[messageHash] = INBOX_STATUS_RECEIVED;
        rollingHash = EfficientLeftRightKeccak.efficientKeccak(rollingHash, messageHash);
        ++currentL1MessageNumber;
      }
    }
    if (currentL1MessageNumber != finalMessageNumber) {
      revert L1MessageNumberSynchronizationWrong(finalMessageNumber, currentL1MessageNumber);
    }
    if (finalRollingHash != rollingHash) {
      revert L1RollingHashSynchronizationWrong(finalRollingHash, rollingHash);
    }
    if (currentL1MessageNumber != lastAnchoredL1MessageNumber) {
      lastAnchoredL1MessageNumber = currentL1MessageNumber;
      l1RollingHashes[currentL1MessageNumber] = rollingHash;
      emit L1L2MessageHashesAddedToInbox(messageHashes);
      emit RollingHashUpdated(currentL1MessageNumber, rollingHash);
    }
  }

  /* @notice Update the status of L1->L2 message when a user claims a message on L2.
   * @param messageHash Hash of the message.
   */
  function _updateL1L2MessageStatusToClaimed(bytes32 messageHash) internal {
    if (inboxL1L2MessageStatus[messageHash] != INBOX_STATUS_RECEIVED) {
      revert MessageDoesNotExistOrHasAlreadyBeenClaimed(messageHash);
    }
    inboxL1L2MessageStatus[messageHash] = INBOX_STATUS_CLAIMED;
  }
}
