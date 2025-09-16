pragma solidity ^0.8.30;

import {ILineaConnector} from "./ILineaConnector.sol";

interface ILineaL1Connector is ILineaConnector{

  /**
   * @notice Emitted after all messages are anchored on L2 and the latest message index and rolling hash stored.
   * @param messageNumber The indexed unique L1 computed indexed message number for the message.
   * @param rollingHash The indexed L1 rolling hash computed for the current message number.
   * @dev This event is used to provide data to the rollup. The last messageNumber and rollingHash, emitted in a rollup will be used in the public input for validating the L1->L2 messaging state transition.
   */
  event RollingHashUpdated(uint256 indexed messageNumber, bytes32 indexed rollingHash);

  /**
   * @notice Emitted when L2 minimum fee is changed.
   * @param previousMinimumFee The previous minimum fee in Wei.
   * @param newMinimumFee The new minimum fee in Wei.
   * @param calledBy The indexed address who changed the minimum fee.
   */
  event MinimumFeeChanged(uint256 previousMinimumFee, uint256 newMinimumFee, address indexed calledBy);

  /**
   * @notice Emitted when L1->L2 message hashes have been added to L2 storage.
   * @param messageHashes The message hashes that were added to L2 for claiming.
   */
  event L1L2MessageHashesAddedToInbox(bytes32[] messageHashes);

  /* @dev Reverts when the message hashes array length is zero. */
  error MessageHashesListLengthIsZero();

  /* @dev Reverts when message number synchronization is mismatched. */
  error L1MessageNumberSynchronizationWrong(uint256 expected, uint256 found);

  /* @dev Reverts when rolling hash synchronization is mismatched. */
  error L1RollingHashSynchronizationWrong(bytes32 expected, bytes32 found);

  /* @dev Reverts when final rolling hash is zero hash. */
  error FinalRollingHashIsZero();

  /* @dev Thrown when the message hashes list length is higher than one hundred. */
  error MessageHashesListLengthHigherThanOneHundred(uint256 length);

  /* @dev Thrown when the message does not exist or has already been claimed. */
  error MessageDoesNotExistOrHasAlreadyBeenClaimed(bytes32 messageHash);

}
