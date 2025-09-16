pragma solidity ^0.8.30;

import "../ConnectorBase.sol";

import "./interfaces/IEEAConnector.sol";

contract EthereumConnector is IEEAConnector, ConnectorBase {

  function decodeAndVerify(
    uint256 networkId,
    bytes calldata encodedInfo,
    bytes calldata encodedProof
  ) external view virtual override returns (address contractAddress, bytes memory functionCallData) {
    revert NotImplementedOrSupported();
  }

  function authenticateHiddenAuthParams(
    address contractAddress,
    bytes memory functionCallData
  ) external view virtual override returns (bool) {
    revert NotImplementedOrSupported();
  }

  function updateAndCommit(
    uint256 networkId,
    address contractAddress,
    bytes calldata functionCallData
  ) external virtual override {
    bytes memory functionCallDataWithAuthParams = encodeAuthParams(localNetworkId, msg.sender, functionCallData);
    emit CrosschainFunctionCall(networkId, contractAddress, functionCallDataWithAuthParams);
  }
}
