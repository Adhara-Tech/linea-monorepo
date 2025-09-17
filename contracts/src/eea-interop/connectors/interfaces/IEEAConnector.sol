pragma solidity ^0.8.30;


interface IEEAConnector  {

  /**
   * @notice This event is included in the EEA specification to facilitate crosschain messaging to and from EVM systems.
   * @param networkId Identifier of the target network where the call is to be made.
   * @param contractAddress Address of the contract on the target network to which the function call is to be made.
   * @param functionCallData The function call data that consists of the ABI-encoded function selector and input parameter data with which the remote function should be called.
   */
  event CrosschainFunctionCall(uint256 networkId, address contractAddress, bytes functionCallData);
}
