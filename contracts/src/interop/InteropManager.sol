pragma solidity ^0.8.30;

import "./interfaces/IInteroperable.sol";
import "./interfaces/IConnector.sol";
import "./interfaces/IAuthParams.sol";

contract InteropManager is IInteroperable
{
  uint256 private constant MAX_REMOTE_CHAIN_SIZE = 50;
  uint256 private constant MAX_LISTING_SIZE = 50;

  uint256[] private remoteSourceNetworkIndices;
  uint256[] private remoteDestinationNetworkIndices;
  mapping(uint256 => RemoteNetworkData) private remoteSourceNetworkData;
  mapping(uint256 => RemoteNetworkData) private remoteDestinationNetworkData;

  bytes4 private constant ERROR_SIG = bytes4(keccak256("Error(string)"));
  bytes4 private constant PANIC_SIG = bytes4(keccak256("Panic(uint256)"));

  /* @notice Remote network data structure to store connectors and current status */
  struct RemoteNetworkData {
    address connectorAddress;
    bytes32 status;
  }

  /* @notice Adds a remote network as a source of remote function calls by linking a local connector to the remote network to enable interop with the remote network.
   * @param networkId The id of the remote network.
   * @param connectorAddress The address of the network connector contract in the local network.
   */
  function addRemoteSourceNetwork(
    uint256 networkId,
    address connectorAddress
  ) external override {
    if (remoteSourceNetworkData[networkId].status == STATUS_NON_EXISTENT) {
      remoteSourceNetworkIndices.push(networkId);
    }
    remoteSourceNetworkData[networkId].connectorAddress = connectorAddress;
    remoteSourceNetworkData[networkId].status = STATUS_CREATED;
  }

  /* @notice Removes a remote source network.
   * @param networkId The id of the remote network
   */
  function removeRemoteSourceNetwork(
    uint256 networkId
  ) external override {
    delete remoteSourceNetworkData[networkId];
    uint256 i = 0;
    for (; i < remoteSourceNetworkIndices.length; i++) {
      if (remoteSourceNetworkIndices[i] == networkId) break;
    }
    bool found = i < remoteSourceNetworkIndices.length;
    for (; i < remoteSourceNetworkIndices.length-1; i++) {
      remoteSourceNetworkIndices[i] = remoteSourceNetworkIndices[i+1];
    }
    if (found) remoteSourceNetworkIndices.pop();
  }

  /* @notice Enables the execution of remote function calls from the remote source network.
   * @param networkId The id of the remote network.
   */
  function enableRemoteSourceNetwork(
    uint256 networkId
  ) external override {
    require(remoteSourceNetworkData[networkId].status != STATUS_NON_EXISTENT, "The source network is unknown");
    remoteSourceNetworkData[networkId].status = STATUS_ENABLED;
  }

  /* @notice Disables the execution of remote function calls from the remote source network.
   * @param networkId The id of the remote network.
   */
  function disableRemoteSourceNetwork(
    uint256 networkId
  ) external override {
    require(remoteSourceNetworkData[networkId].status != STATUS_NON_EXISTENT, "The source network is unknown");
    remoteSourceNetworkData[networkId].status = STATUS_DISABLED;
  }

  /*
   * Gets the remote source network data
   * @param networkId The id of the remote network.
   */
  function getRemoteSourceNetworkData(
    uint256 networkId
  ) external view override returns (
    address connectorAddress,
    bytes32 status
  ){
    return (
      remoteSourceNetworkData[networkId].connectorAddress,
      remoteSourceNetworkData[networkId].status
    );
  }

  /*
   * Returns the list of remote source chains registered for interop.
   * @param startIndex The starting index from where to list the items.
   * @param limit The number of items to return in the list.
   */
  function listRemoteSourceNetworks(
    uint256 startIndex,
    uint256 limit
  ) external view override returns (
    uint256[] memory items,
    bool moreItems,
    uint256 providedStartIndex,
    uint256 providedLimit
  ){
    require(startIndex == 0 || startIndex < remoteSourceNetworkIndices.length, "Start index is out of bounds");
    providedLimit = limit;
    providedStartIndex = startIndex;
    moreItems = false;
    limit = remoteSourceNetworkIndices.length-startIndex;
    if (providedLimit == 0) {
      if (limit > MAX_LISTING_SIZE) {
        moreItems = true;
        limit = MAX_LISTING_SIZE;
      }
    } else if (limit > providedLimit) {
      moreItems = true;
      limit = providedLimit;
    }
    items = new uint256[](limit);
    for (uint256 i=0; i<limit; i++) {
      items[i] = remoteSourceNetworkIndices[startIndex+i];
    }
  }

  /*
   * Adds a remote network as a destination of remote function calls by linking a local connector to the remote network to enable interop with the remote network.
   * @param networkId The id of the remote network.
   * @param connectorAddress The address of the network connector contract in the local network.
   */
  function addRemoteDestinationNetwork(
    uint256 networkId,
    address connectorAddress
  ) external override {
    if (remoteDestinationNetworkData[networkId].status == STATUS_NON_EXISTENT) {
      remoteDestinationNetworkIndices.push(networkId);
    }
    remoteDestinationNetworkData[networkId].connectorAddress = connectorAddress;
    remoteDestinationNetworkData[networkId].status = STATUS_CREATED;
  }

  /*
   * Removes a remote destination network.
   * @param networkId The id of the remote network.
   */
  function removeRemoteDestinationNetwork(
    uint256 networkId
  ) external override {
    delete remoteDestinationNetworkData[networkId];
    uint256 i = 0;
    for (; i < remoteDestinationNetworkIndices.length-1; i++) {
      if (remoteDestinationNetworkIndices[i] == networkId) break;
    }
    bool found = i < remoteDestinationNetworkIndices.length;
    for (; i < remoteDestinationNetworkIndices.length-1; i++) {
      remoteDestinationNetworkIndices[i] = remoteDestinationNetworkIndices[i+1];
    }
    if (found) remoteDestinationNetworkIndices.pop();
  }

  /*
   * Enables the execution of remote function calls from the remote destination network.
   * @param networkId The id of the remote network
   */
  function enableRemoteDestinationNetwork(
    uint256 networkId
  ) external override {
    require(remoteDestinationNetworkData[networkId].status != STATUS_NON_EXISTENT, "The destination network is unknown");
    remoteDestinationNetworkData[networkId].status = STATUS_ENABLED;
  }

  /*
   * Disables the execution of remote function calls from the remote destination network.
   * @param networkId The id of the remote network
   */
  function disableRemoteDestinationNetwork(
    uint256 networkId
  ) external override{
    require(remoteDestinationNetworkData[networkId].status != STATUS_NON_EXISTENT, "The destination network is unknown");
    remoteDestinationNetworkData[networkId].status = STATUS_DISABLED;
  }

  /*
   * Gets the remote destination network data
   * @param networkId The id of the remote network
   */
  function getRemoteDestinationNetworkData(
    uint256 networkId
  ) external view override returns (
    address connectorAddress,
    bytes32 status
  ) {
    return (
      remoteDestinationNetworkData[networkId].connectorAddress,
      remoteDestinationNetworkData[networkId].status
    );
  }

  /*
   * Returns the list of remote destination chains registered for interop
   * @param startIndex The starting index from where to list the items.
   * @param limit The number of items to return in the list.
   */
  function listRemoteDestinationNetworks(
    uint256 startIndex,
    uint256 limit
  ) external view override returns (
    uint256[] memory items,
    bool moreItems,
    uint256 providedStartIndex,
    uint256 providedLimit
  ) {
    require(startIndex == 0 || startIndex < remoteDestinationNetworkIndices.length, "Start index is out of bounds");
    providedLimit = limit;
    providedStartIndex = startIndex;
    moreItems = false;
    limit = remoteDestinationNetworkIndices.length-startIndex;
    if (providedLimit == 0) {
      if (limit > MAX_LISTING_SIZE) {
        moreItems = true;
        limit = MAX_LISTING_SIZE;
      }
    } else if (limit > providedLimit) {
      moreItems = true;
      limit = providedLimit;
    }
    items = new uint256[](limit);
    for (uint256 i=0; i<limit; i++) {
      items[i] = remoteDestinationNetworkIndices[startIndex+i];
    }
  }

  /*
   * Emits a CrosschainFunctionCall event after adding authentication parameters to function call data, if enabled.
   * @param networkId The destination network identification.
   * @param contractAddress The destination contract address.
   * @param functionCallData The function call data to emit the event with.
   */
  function outboundCall(
    uint256 networkId,
    address contractAddress,
    bytes calldata functionCallData
  ) external override {
    (address connectorAddress, bytes32 networkStatus) = getRemoteDestinationNetworkData(networkId);
    require(networkStatus == STATUS_ENABLED, "Connector does not exist or is disabled.");
    IConnector crosschainConnector = IConnector(connectorAddress);
    // Update local storage and commit to outgoing call
    try crosschainConnector.updateAndCommit(networkId, contractAddress, functionCallData) {
    } catch Error(string memory revertReason) {
      revert(string.concat("An error [", revertReason, "] occurred in connector contract."));
    } catch (bytes memory revertReason) {
      if (revertReason.length >= 4) {
        bytes4 selector;
        assembly {
          selector := mload(add(revertReason, 32))
        }
        if (selector == PANIC_SIG) {
          revert("A panic occurred in connector contract.");
        } else {
          revert("An error occurred in connector contract.");
        }
      } else {
        revert("An unknown error occurred in connector contract.");
      }
    }
  }

  /*
   * Perform function call from a remote network.
   * @param networkId The remote source network identification.
   * @param encodedInfo Remote source network information to verify and decode verified local network id, destination contract address and function call data from.
   * @param encodedProof Remote source network proof need te verify encoded information.
   */
  function inboundCall(
    uint256 networkId,
    bytes calldata encodedInfo,
    bytes calldata encodedProof
  ) external override {
    (address connectorAddress, bytes32 networkStatus) = getRemoteSourceNetworkData(networkId);
    require(networkStatus == STATUS_ENABLED, "Connector does not exist or is disabled.");
    IConnector crosschainConnector = IConnector(connectorAddress);
    // Get verified execution parameters for incoming call
    address contractAddress;
    bytes memory functionCallData;
    try crosschainConnector.decodeAndVerify(networkId, encodedInfo, encodedProof) returns (
      address _contractAddress,
      bytes memory _functionCallData
    ) {
      contractAddress = _contractAddress;
      functionCallData = _functionCallData;
    } catch Error(string memory revertReason) {
      revert("An error occurred in connector contract.");
    } catch (bytes memory revertReason) {
      if (revertReason.length >= 4) {
        bytes4 selector;
        assembly {
          selector := mload(add(revertReason, 32))
        }
        if (selector == PANIC_SIG) {
          revert("A panic occurred in connector contract.");
        } else {
          revert("An error occurred in connector contract.");
        }
      } else {
        revert("An unknown error occurred in connector contract.");
      }
    }
    // Check that the target address contains code
    if (!_isContract(contractAddress)) {
      revert(string.concat("No contract exists at address."));
    }
    // Make call to connector to check hidden authentication parameters
    bool isValid = crosschainConnector.authenticateHiddenAuthParams(contractAddress, functionCallData);
    require(isValid, "Provided authentication parameters in function calldata are not valid");
    // Check if this call was already processed
    bytes32 callDataHash = keccak256(abi.encodePacked(networkId, encodedInfo, encodedProof));
    require(!_isCacheEntry(callDataHash), "This inbound call was already successfully processed.");
    // Execute call and handle success / revert
    (bool success, bytes memory data) = contractAddress.call(functionCallData);
    if (!success) {
      if (data.length >= 4) {
        bytes4 revertSelector;
        assembly {
          revertSelector := mload(add(data, 32))
        }
        if (revertSelector == ERROR_SIG) {
          revert(string.concat("An error occurred in called contract."));
        } else {
          revert(string.concat("A panic occurred in called contract."));
        }
      } else {
        revert(string.concat("An unknown error occurred in called contract."));
      }
    } else {
      _addCacheEntry(callDataHash);
    }
  }

  function _addCacheEntry(bytes32 cacheEntryKey) internal virtual returns (bool) {
    return true;
  }

  function _isCacheEntry(bytes32 cacheEntryKey) internal view virtual returns (bool) {
    return false;
  }

  // This function safely identifies whether the account points to a contract,
  // but should NOT be used to identify whether the account is an external (human) address.
  // If it returns true, then the account must be a contract. If it returns false,
  // the account may be either a human or a contract (constructors are executed while extcodesize = 0).
  // See https://ethereum.stackexchange.com/a/14016/36603
  // for more details about how this works.
  // solhint-disable-next-line no-inline-assembly
  function _isContract(address addr) internal view returns (bool) {
    uint32 size;
    assembly {
      size := extcodesize(addr)
    }
    return (size > 0);
  }

}

