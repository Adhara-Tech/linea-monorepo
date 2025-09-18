pragma solidity ^0.8.30;

abstract contract LineaConnector  {

 /**
   * @notice Duplicated cause of calldata parameter
   * @notice Hashes messages using assembly for efficiency.
   * @dev Adding 0xc0 is to indicate the calldata offset relative to the memory being added to.
   * @dev If the calldata is not modulus 32, the extra bit needs to be added on at the end else the hash is wrong.
   * @param _from The from address.
   * @param _to The to address.
   * @param _fee The fee paid for delivery.
   * @param _valueSent The value to be sent when delivering.
   * @param _messageNumber The unique message number.
   * @param _calldata The calldata to be passed to the destination address.
   */
  function hashMessage(
    address _from,
    address _to,
    uint256 _fee,
    uint256 _valueSent,
    uint256 _messageNumber,
    bytes memory _calldata
  ) external pure returns (bytes32 messageHash) {
    assembly {
    // Get the free memory pointer
      let mPtr := mload(0x40)
    // Store fixed-size parameters
      mstore(mPtr, _from)
      mstore(add(mPtr, 0x20), _to)
      mstore(add(mPtr, 0x40), _fee)
      mstore(add(mPtr, 0x60), _valueSent)
      mstore(add(mPtr, 0x80), _messageNumber)
    // Store offset to dynamic data: _calldata starts at 0xA0 in this structure
      mstore(add(mPtr, 0xA0), 0xC0)
    // Store length of _calldata
      let cdLen := mload(_calldata)
      mstore(add(mPtr, 0xC0), cdLen)
    // Copy _calldata content (skipping the first 32 bytes, which is the length)
      let dataStart := add(_calldata, 0x20)
      let dest := add(mPtr, 0xE0)
      for { let i := 0 } lt(i, cdLen) { i := add(i, 0x20) } {
        mstore(add(dest, i), mload(add(dataStart, i)))
      }
    // Calculate padded length
      let rem := mod(cdLen, 0x20)
      let paddedLen := add(cdLen, sub(0x20, rem))
      if iszero(rem) {
        paddedLen := cdLen
      }
    // Compute keccak256 over the full memory range
      messageHash := keccak256(mPtr, add(0xE0, paddedLen))
    }
  }
}
