pragma solidity ^0.8.30;

abstract contract IConnector {
  /**
   * @notice Performs all steps needed to verify a crosschain call and returns verified parameters for function call execution.
   * @param networkId The id of the remote chain that originated the cross blockchain call.
   * @param encodedInfo The encoded information of the event needed to trigger the crosschain call.
   * @param encodedProof The signature or proof used to check whether the encodedInfo is valid.
   * @return contractAddress The verified contract address where the crosschain function call should be executed.
   * @return functionCallData The verified function call data with which the crosschain function call should be made.
   */
  function decodeAndVerify(
    uint256 networkId,
    bytes calldata encodedInfo,
    bytes calldata encodedProof
  ) external view virtual returns (address contractAddress, bytes memory functionCallData);

  /**
   * @notice Authenticates the hidden auth parameters appended to the end of the function calldata.
   * @notice See https://entethalliance.org/specs/dlt-interop/#application-authentication-parameters
   * @param contractAddress The address of the contract where the call is being made to
   * @param functionCallData The calldata of the call, including the hidden auth parameters
   * @return isValid A boolean, indicating whether the parameters are valid
   */
  function authenticateHiddenAuthParams(
    address contractAddress,
    bytes memory functionCallData
  ) external view virtual returns (bool isValid);

  /**
   * @notice Performs all local prerequisite updates and commits to a crosschain call.
   * @param networkId Identifier of target network where the function call is to be made.
   * @param contractAddress Address of the contract on the target network to which the function call is to be made.
   * @param functionCallData The function call data that consists of the ABI-encoded function selector and input parameter data with which the remote function should be called.
   */
  function updateAndCommit(
    uint256 networkId,
    address contractAddress,
    bytes calldata functionCallData
  ) external virtual;

  function getLocalNetworkId() external view virtual returns (uint256);

  function getRemoteNetworkId() external view virtual returns (uint256);

  /* @dev Thrown when a feature is not implemented or supported yet. */
  error NotImplementedOrSupported();
}
