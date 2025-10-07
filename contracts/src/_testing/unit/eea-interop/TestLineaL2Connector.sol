// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.30;

import { LineaL2Connector } from "../../../eea-interop/connectors/LineaL2Connector.sol";

contract TestLineaL2Connector is LineaL2Connector {

  function setL2L1MessageToClaimed(uint256 _messageNumber) external {
    _setL2L1MessageToClaimed(_messageNumber);
  }

  function isMessageClaimed(uint256 _messageNumber) external view returns (bool) {
    return _isMessageClaimed(_messageNumber);
  }


//  function addL2L1MessageHash(bytes32 _messageHash) external {
//    if (inboxL2L1MessageStatus[_messageHash] != INBOX_STATUS_UNKNOWN) {
//      revert MessageAlreadyReceived(_messageHash);
//    }
//
//    inboxL2L1MessageStatus[_messageHash] = INBOX_STATUS_RECEIVED;
//  }
}
