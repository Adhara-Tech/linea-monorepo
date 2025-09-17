pragma solidity ^0.8.30;

abstract contract IAuthParams  {

  /**
   * @notice Helper function for doing some sanity checks on the calldata before decoding it.
   * @notice Decoding will fail unless the calldata is at least 52 bytes long, but
   * @notice Should be at least 56 bytes to include the function signature as well
   */
  function authParamsCanBeDecoded(uint256 calldataLength) internal pure returns (bool) {
    if (calldataLength < 56) {
      return false;
    }
    return true;
  }

  /**
   * @notice Encodes the network identification and contract address and appends it to the function call data.
   * @param functionCallParameters The function call parameters to append the authentication parameters to.
   * @param networkId The network identification to include in the authentication parameters.
   * @param contractAddress The contract address to include in the authentication parameters.
   * @return Returns the function call parameters with concatenated authentication parameters.
   */
  function encodeAuthParams(
    bytes memory functionCallParameters,
    uint256 networkId,
    address contractAddress
  ) internal pure returns (bytes memory) {
    return bytes.concat(functionCallParameters, abi.encodePacked(networkId, contractAddress));
  }

  /**
   * @notice Decodes the network identification and contract address found at the end of the calldata sent to the target function
   * @notice of the inbound call. IMPORTANT: This function will only work properly when used as part of the
   * @notice execution of the inbound cross blockchain call, i.e. with the calldata/msg.data exactly equal
   * @notice to the functionCallData provided in the encodedInfo - otherwise there can be an unknown number of zeros padded
   * @notice at the end, making it difficult / impossible to robustly perform this decoding.
   * @notice The function call parameters to extract the authentication parameters from is obtained from msg.data.
   * @return networkId The network identification extracted from the authentication parameters.
   * @return contractAddress The contract address extracted from the authentication parameters.
   */
  function decodeAuthParams() internal pure returns (uint256 networkId, address contractAddress) {
    bytes calldata allParams = msg.data;
    uint256 len = allParams.length;

    require(authParamsCanBeDecoded(len), "Failed to decode hidden auth parameters");

    assembly {
      calldatacopy(0, sub(len, 52), 32)
      networkId := mload(0)
      // start with offset of 12 to account for the 12 zero padded bytes in address types
      calldatacopy(12, sub(len, 20), 20)
      contractAddress := mload(0)
    }
  }

  /**
   * @notice Decodes the network identification and contract address found at the end of the calldata sent to the target function
   * @notice of the inbound call. This function differs from decodeNonAtomicAuthParamsFromCalldata since it operates on
   * @notice a parameter instead of directly on msg.data. The passed in functionCallData must be exactly what
   * @notice is going to be used when invoking the call on the target contract.
   * @notice The function call parameters to extract the authentication parameters from is obtained from msg.data.
   * @return networkId The network identification extracted from the authentication parameters.
   * @return contractAddress The contract address extracted from the authentication parameters.
   */
  function decodeAuthParamsFromParameter(
    bytes memory functionCallData
  ) internal pure returns (uint256 networkId, address contractAddress) {
    uint256 len = functionCallData.length;
    uint256 byteOffset = 0;

    require(authParamsCanBeDecoded(len), "Failed to decode hidden auth parameters");

    assembly {
      // add offset of 32 to get to start of dynamic bytes array data (first word contains length),
      // then subtract the 32 (uint256) + 20 (address) = 52 bytes
      byteOffset := sub(add(len, 32), 52)
      networkId := mload(add(functionCallData, byteOffset))
      // add offset of 32 to get to start of dynamic bytes array data (first word contains length),
      // then subtract the 20 (address) bytes
      // Since abi.encodePacked was used to append the auth params, there is no zero padding in front
      // of the address. We can add our own zero padding by reading from 32 bytes from the back, which
      // overlaps with the networkId data, and then setting the first 12 bytes to zero using a bit mask
      byteOffset := sub(add(len, 32), 32)
      contractAddress := mload(add(functionCallData, byteOffset))
      contractAddress := and(contractAddress, 0x000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
    }
  }
}
