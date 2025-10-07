// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.30;
import { L2MessageServiceBase } from "./L2MessageServiceBase.sol";
import {IL2MessageService} from "./interfaces/IL2MessageService.sol";
/**
 * @title Contract to manage cross-chain messaging on L2.
 * @author ConsenSys Software Inc.
 * @custom:security-contact security-report@linea.build
 */
contract L2MessageService is L2MessageServiceBase, IL2MessageService {
  /// @dev Total contract storage is 50 slots with the gap below.
  /// @dev Keep 50 free storage slots for future implementation updates to avoid storage collision.
  uint256[50] private __gap_L2MessageService;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /**
   * @notice Initializes underlying message service dependencies.
   * @param _rateLimitPeriod The period to rate limit against.
   * @param _rateLimitAmount The limit allowed for withdrawing the period.
   * @param _defaultAdmin The account to be given DEFAULT_ADMIN_ROLE on initialization.
   * @param _roleAddresses The list of addresses to grant roles to.
   * @param _pauseTypeRoleAssignments The list of pause type roles.
   * @param _unpauseTypeRoleAssignments The list of unpause type roles.
   */
  function initialize(
    uint256 _rateLimitPeriod,
    uint256 _rateLimitAmount,
    address _defaultAdmin,
    RoleAddress[] calldata _roleAddresses,
    PauseTypeRole[] calldata _pauseTypeRoleAssignments,
    PauseTypeRole[] calldata _unpauseTypeRoleAssignments
  ) external virtual initializer {
    __L2MessageService_init(
      _rateLimitPeriod,
      _rateLimitAmount,
      _defaultAdmin,
      _roleAddresses,
      _pauseTypeRoleAssignments,
      _unpauseTypeRoleAssignments
    );
  }

  /**
   * @notice Add cross-chain L1->L2 message hashes in storage.
   * @param _messageHashes New message hashes to anchor on L2.
   * @param _startingMessageNumber The expected L1 message number to start when anchoring.
   * @param _finalMessageNumber The expected L1 message number to end on when anchoring.
   * @param _finalRollingHash The expected L1 rolling hash to end on when anchoring.
   */
  function anchorL1L2MessageHashes(
    bytes32[] calldata _messageHashes,
    uint256 _startingMessageNumber,
    uint256 _finalMessageNumber,
    bytes32 _finalRollingHash
  ) external virtual override {
    _anchorL1L2MessageHashes(_messageHashes, _startingMessageNumber, _finalMessageNumber, _finalRollingHash);
  }
}
