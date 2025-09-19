pragma solidity ^0.8.30;

import "../../libraries/EfficientLeftRightKeccak.sol";

import "../../messaging/libraries/MessageHashing.sol";
import "../ConnectorBase.sol";

import "../interfaces/IAuthParams.sol";

import "../interfaces/IConnector.sol";
import "./LineaConnector.sol";
import "./interfaces/IL1LineaConnector.sol";

contract LineaL1Connector is ILineaL1Connector, ConnectorBase, LineaConnector {

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
  ) external virtual override returns (address contractAddress, bytes memory functionCallData) {
    // Receiving from a L1 Linea anchor network requires a call to L2MessageService:claimMessage(). This will execute the call.
    // Verification requires access to a map [inboxL1L2MessageStatus].
    // The map [inboxL1L2MessageStatus] is updated by an external function [anchorL1L2MessageHashes] invoked by a trusted party to anchor L1 [rollingHashes] on L2.

    (uint256 targetNetworkId, address targetContractAddress, bytes memory msgData) = abi.decode(encodedInfo, (uint256, address, bytes));
    MessageData memory message = abi.decode(msgData, (MessageData));
    // Proof memory proof = abi.decode(encodedProof, (Proof));

    bytes32 messageHash = this.hashMessage(message.from, message.to, message.fee, message.value, message.messageNumber, message.data);
    _updateL1L2MessageStatusToClaimed(messageHash);
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

    bytes32 messageHash = this.hashMessage(msg.sender, contractAddress, relayerFee, valueSent, messageNumber, functionCallData);
    emit MessageSent(msg.sender, contractAddress, relayerFee, valueSent, messageNumber, functionCallDataWithAuthParams, messageHash);

    // Pay minimum fees.
    (bool success, ) = block.coinbase.call{ value: coinbaseFee }("");
    if (!success) {
      revert FeePaymentFailed(block.coinbase);
    }
  }

  function sendMessage(address _to, uint256 _fee, bytes calldata _calldata) external payable override {
    revert NotImplementedOrSupported();
  }

  function claimMessage(address _from, address _to, uint256 _fee, uint256 _value, address payable _feeRecipient, bytes calldata _calldata, uint256 _nonce) external override {
    revert NotImplementedOrSupported();
  }

  function sender() external view override returns (address) {
    revert NotImplementedOrSupported();
  }

  function anchorL1L2MessageHashes(
    bytes32[] calldata messageHashes,
    uint256 startingMessageNumber,
    uint256 finalMessageNumber,
    bytes32 finalRollingHash
  ) external override {
    // TODO: Check permission
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
        rollingHash = EfficientLeftRightKeccak._efficientKeccak(rollingHash, messageHash);
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
