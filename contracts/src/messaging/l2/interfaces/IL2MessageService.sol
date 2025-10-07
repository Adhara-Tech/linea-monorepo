// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

/**
 * @title L2 Message Service interface for pre-existing functions, events, structs and errors.
 * @author ConsenSys Software Inc.
 * @custom:security-contact security-report@linea.build
 */

interface IL2MessageService {
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
  ) external; // TODO: Protect this function with a permission so that only the coordinator can call
}
