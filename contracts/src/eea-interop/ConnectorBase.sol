pragma solidity ^0.8.30;

import "./interfaces/IConnector.sol";
import "./interfaces/IAuthParams.sol";

abstract contract ConnectorBase is IConnector, IAuthParams {

  uint256 private localNetworkId;
  uint256 private remoteNetworkId;

  function getLocalNetworkId() external view override returns (uint256) {
    return localNetworkId;
  }

  function setLocalNetworkId(uint256 networkId) external {
    localNetworkId = networkId;
  }

  function getRemoteNetworkId() external view override returns (uint256) {
    return remoteNetworkId;
  }

  function setRemoteNetworkId(uint256 networkId) external {
    remoteNetworkId = networkId;
  }


}
