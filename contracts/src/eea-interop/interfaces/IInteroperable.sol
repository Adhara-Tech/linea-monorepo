pragma solidity ^0.8.30;

abstract contract IInteroperable
{
  bytes32 public constant STATUS_NON_EXISTENT = "";
  bytes32 public constant STATUS_CREATED = "created";
  bytes32 public constant STATUS_ENABLED = "enabled";
  bytes32 public constant STATUS_DISABLED = "disabled";

  /**
   * @notice Executes a crosschain function call from a remote chain, if a valid proof is provided.
   * @param networkId Identifier of the source network that initiated the remote function call. This must be a registered remote chain.
   * @param encodedInfo The ABI-encoded remote source network information containing the local destination network identifier, contract address and function call data encoded in remote event, transaction or state change data that needs to be verified before executing the function call locally.
   * @param encodedProof The ABI-encoded remote source network proof data and/or signatures that an implementation can use to verify the information given in encodedInfo.
   */
  function inboundCall(uint256 networkId, bytes calldata encodedInfo, bytes calldata encodedProof) external virtual;

  event InboundCallExecuted(uint256 networkId, bytes encodedInfo, bytes encodedProof);

  /**
   * @notice Attempts to trigger a crosschain function call in a remote network, which will only succeed of a valid proof can be provided.
   * @param networkId Identifier of target network where the function call is to be made.
   * @param contractAddress Address of the contract on the target network to which the function call is to be made.
   * @param functionCallData The function call data that consists of the ABI-encoded function selector and input parameter data with which the remote function should be called.
   */
  function outboundCall(uint256 networkId, address contractAddress, bytes calldata functionCallData) external virtual;

  event OutboundCallExecuted(uint256 networkId, address contractAddress, bytes functionCallData);

  /**
   * @notice Adds a remote network as a source of remote function calls by linking a local connector to the remote network to enable interop with the remote network
   * @param networkId the id of the remote network
   * @param connectorAddress the address of the network connector contract in the local network
   */
  function addRemoteSourceNetwork(
    uint256 networkId,
    address connectorAddress
  ) external virtual;

  event AddRemoteSourceNetworkExecuted(uint256 networkId, address connectorAddress);

  /**
   * @notice Removes a remote source network
   * @param networkId the id of the remote network
   */
  function removeRemoteSourceNetwork(
    uint256 networkId
  ) external virtual;

  event RemoveRemoteSourceNetworkExecuted(uint256 networkId);

  /**
   * @notice Enables the execution of remote function calls from the remote source network
   * @param networkId the id of the remote network
   */
  function enableRemoteSourceNetwork(
    uint256 networkId
  ) external virtual;

  event EnableRemoteSourceNetworkExecuted(uint256 networkId);

  /**
   * @notice Disables the execution of remote function calls from the remote source network
   * @param networkId the id of the remote network
   */
  function disableRemoteSourceNetwork(
    uint256 networkId
  ) external virtual;

  event DisableRemoteSourceNetworkExecuted(uint256 networkId);

  /**
   * @notice Gets the remote source network data
   * @param networkId the id of the remote network
   */
  function getRemoteSourceNetworkData(
    uint256 networkId
  ) external virtual view returns (
    address connectorAddress,
    bytes32 status
  );

  /**
   * @notice Returns the list of remote source chains registered for interop
   * @param startIndex The starting index from where to list the items
   * @param limit The number of items to return in the list
   */
  function listRemoteSourceNetworks(
    uint256 startIndex,
    uint256 limit
  ) external virtual view returns (
    uint256[] memory items,
    bool moreItems,
    uint256 providedStartIndex,
    uint256 providedLimit
  );

  /**
   * @notice Adds a remote network as a destination of remote function calls by linking a local connector to the remote network to enable interop with the remote network
   * @param networkId the id of the remote network
   * @param connectorAddress the address of the network connector contract in the local network
   */
  function addRemoteDestinationNetwork(
    uint256 networkId,
    address connectorAddress
  ) external virtual;

  event AddRemoteDestinationNetworkExecuted(uint256 networkId, address connectorAddress);

  /**
   * @notice Removes a remote destination network
   * @param networkId the id of the remote network
   */
  function removeRemoteDestinationNetwork(
    uint256 networkId
  ) external virtual;

  event RemoveRemoteDestinationNetworkExecuted(uint256 networkId);

  /**
   * @notice Enables the execution of remote function calls from the remote destination network
   * @param networkId the id of the remote network
   */
  function enableRemoteDestinationNetwork(
    uint256 networkId
  ) external virtual;

  event EnableRemoteDestinationNetworkExecuted(uint256 networkId);

  /**
   * @notice Disables the execution of remote function calls from the remote destination network
   * @param networkId the id of the remote network
   */
  function disableRemoteDestinationNetwork(
    uint256 networkId
  ) external virtual;

  event DisableRemoteDestinationNetworkExecuted(uint256 networkId);

  /**
   * @notice Gets the remote destination network data
   * @param networkId the id of the remote network
   */
  function getRemoteDestinationNetworkData(
    uint256 networkId
  ) external virtual view returns (
    address connectorAddress,
    bytes32 status
  );

  /**
   * @notice Returns the list of remote destination networks registered for interop
   * @param startIndex The starting index from where to list the items
   * @param limit The number of items to return in the list
   */
  function listRemoteDestinationNetworks(
    uint256 startIndex,
    uint256 limit
  ) external virtual view returns (
    uint256[] memory items,
    bool moreItems,
    uint256 providedStartIndex,
    uint256 providedLimit
  );


}
