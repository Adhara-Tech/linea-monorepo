// SPDX-License-Identifier: MIT

pragma solidity ^0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ATC
 * @dev Simple ATC Token example.
 */

contract ATC is Ownable {

  /* Hold status codes */
  bytes32 internal constant _HOLD_STATUS_NON_EXISTENT = "";
  bytes32 internal constant _HOLD_STATUS_NEW = "new";
  bytes32 internal constant _HOLD_STATUS_PERPETUAL = "perpetual";
  bytes32 internal constant _HOLD_STATUS_CANCELLED = "cancelled";
  bytes32 internal constant _HOLD_STATUS_EXECUTED = "executed";

  /* Hold types */
  bytes32 internal constant _HOLD_TYPE_NORMAL = "normal";
  bytes32 internal constant _HOLD_TYPE_DESTROY = "destroy";

  struct Hold {
    address fromAccount;
    address toAccount;
    string notaryId;
    uint256 amount;
    uint256 expiryTimestamp;
    bytes32 holdStatus;
    bytes32 holdType;
  }

  mapping(address => uint256) private _balances;
  mapping(string => Hold) private _holds;

  mapping(address => mapping(address => uint256)) private _allowances;

  uint256 private _totalSupply;

  string private _name;
  string private _symbol;
  uint256 private _decimals;

  /**
   * @dev Constructor that gives msg.sender all of existing tokens.
   */

  constructor(string memory name_, string memory symbol_, uint256 initialSupply_) {
    _name = name_;
    _symbol = symbol_;
    _decimals = 6;
  }

  /**
     * @dev Returns the name of the token.
     */
  function name() public view virtual returns (string memory) {
    return _name;
  }

  /**
   * @dev Returns the symbol of the token, usually a shorter version of the
     * name.
     */
  function symbol() public view virtual returns (string memory) {
    return _symbol;
  }

  function decimals() public view virtual returns (uint8) {
    return 6;
  }

  function balanceOf(address account) public view virtual returns (uint256) {
    return _balances[account];
  }

  function getAllowances(address owner, address spender) public view virtual returns (uint256) {
    return _allowances[owner][spender];
  }

  function getHoldData(string calldata operationId)
  external view virtual
  returns (
    address fromAccount,
    address toAccount,
    string memory notaryId,
    uint256 amount,
    uint256 expiryTimestamp,
    bytes32 holdStatus,
    bytes32 holdType
  ) {
    Hold memory holdToReturn = _holds[operationId];
    requireExistingHold(holdToReturn);

    return (holdToReturn.fromAccount,
      holdToReturn.toAccount,
      holdToReturn.notaryId,
      holdToReturn.amount,
      holdToReturn.expiryTimestamp,
      holdToReturn.holdStatus,
      holdToReturn.holdType);
  }

  function createHold(
    string calldata operationId,
    address fromAccount,
    address toAccount,
    string calldata notaryId,
    uint256 amount,
    uint256 duration
  ) public returns (bool) {
    requireNonExistingHold(_holds[operationId]);
    require(_balances[fromAccount] >= amount, "Insufficient balance");
    _balances[fromAccount] -= amount;
    Hold memory newHold = Hold(fromAccount, toAccount, notaryId, amount, uint256(0), _HOLD_STATUS_PERPETUAL, _HOLD_TYPE_NORMAL);
    _holds[operationId] = newHold;
    emit CreateHoldExecuted(operationId, fromAccount,  toAccount,  notaryId, amount);
    return true;
  }

  /* @notice Event emitted after a hold was successfully created. */
  event CreateHoldExecuted(
    string operationId,
    address fromAccount,
    address toAccount,
    string notaryId,
    uint256 amount
  );

  function transfer(
    string calldata operationId,
    address fromAccount,
    address toAccount,
    uint256 amount,
    string calldata metaData
  ) public returns (bool) {
    require(_balances[fromAccount] >= amount, "Insufficient balance");
    _balances[fromAccount] -= amount;
    _balances[toAccount] += amount;
    emit TransferExecuted(operationId, fromAccount, toAccount, amount, metaData);
    return true;
  }

  /* Event emitted after tokens were destroyed. */
  event TransferExecuted(
    string operationId,
    address fromAccount,
    address toAccount,
    uint256 amount,
    string metaData
  );

  function executeHold(
    string calldata operationId
  ) external returns (bool) {
    Hold memory holdToExecute = _holds[operationId];
    requireExistingHold(holdToExecute);
    requireExecutableHold(holdToExecute);
    _balances[holdToExecute.toAccount] += holdToExecute.amount;
    delete _holds[operationId];
    emit ExecuteHoldExecuted(operationId);
    return true;
  }

  /* Event emitted after a hold was executed. */
  event ExecuteHoldExecuted(
    string operationId
  );

  function create(address toAccount, uint256 amount) public virtual {
    _balances[toAccount] += amount;
    emit CreateExecuted(toAccount, amount);
  }

  /* @notice Event emitted after tokens were created. */
  event CreateExecuted(
    address toAccount,
    uint256 amount
  );

  function destroy(
    string calldata operationId,
    address fromAccount,
    uint256 amount,
    string calldata metaData
  ) public  {
    require(_balances[fromAccount] >= amount, "Insufficient balance");
    _balances[fromAccount] -= amount;
    emit DestroyExecuted(operationId, fromAccount, amount, metaData);
  }

  /* Event emitted after tokens were destroyed. */
  event DestroyExecuted(
    string operationId,
    address fromAccount,
    uint256 amount,
    string metaData
  );

  function requireValidHold(
    Hold memory hold
  ) internal view {
    require(keccak256(abi.encodePacked(hold.fromAccount)) != keccak256(abi.encodePacked("")), "Invalid sending account in hold data");
    require(keccak256(abi.encodePacked(hold.toAccount)) != keccak256(abi.encodePacked("")), "Invalid receiving account in hold data");
  }

  function requireExistingHold(
    Hold memory hold
  ) internal view {
    require(hold.holdStatus != _HOLD_STATUS_NON_EXISTENT, "Hold does not exist");
  }

  function requireNonExistingHold(
    Hold memory hold
  ) internal view {
    require(hold.holdStatus == _HOLD_STATUS_NON_EXISTENT, "Hold already exists");
  }

  function requireExecutableHold(
    Hold memory hold
  ) internal view {
    require(hold.holdStatus == _HOLD_STATUS_PERPETUAL, "Hold is not executable");
  }

  function requireCancellableHold(
    Hold memory hold
  ) internal view {
    require(hold.holdStatus == _HOLD_STATUS_NEW
    || hold.holdStatus == _HOLD_STATUS_PERPETUAL, "Hold is not cancellable");
  }
}
