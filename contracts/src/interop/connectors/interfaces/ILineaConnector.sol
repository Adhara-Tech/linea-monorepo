pragma solidity ^0.8.30;


interface ILineaConnector  {

  /**
   * @notice Emitted when a message is sent.
   * @param from The indexed sender address of the message (msg.sender).
   * @param to The indexed intended recipient address of the message on the other layer.
   * @param fee The fee being being paid to deliver the message to the recipient in Wei.
   * @param value The value being sent to the recipient in Wei.
   * @param nonce The unique message number.
   * @param calldata The calldata being passed to the intended recipient when being called on claiming.
   * @param messageHash The indexed hash of the message parameters.
   * @dev calldata has the  because calldata is a reserved word.
   * @dev We include the message hash to save hashing costs on the rollup.
   * @dev This event is used on both L1 and L2.
   */
  event MessageSent(address indexed from, address indexed to, uint256 fee, uint256 value, uint256 nonce, bytes calldata, bytes32 indexed messageHash);

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
}
