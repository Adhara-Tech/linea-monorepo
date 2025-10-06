import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { TestLineaL1Connector, TestReceivingContract } from "../../../../typechain-types";
import {
  ADDRESS_ZERO,
  BLOCK_COINBASE,
  EMPTY_CALLDATA,
  GENERAL_PAUSE_TYPE,
  HASH_ZERO,
  INBOX_STATUS_CLAIMED,
  INBOX_STATUS_RECEIVED,
  INITIAL_WITHDRAW_LIMIT,
  LOW_NO_REFUND_MESSAGE_FEE,
  MESSAGE_FEE,
  MESSAGE_VALUE_1ETH,
  MINIMUM_FEE,
  MINIMUM_FEE_SETTER_ROLE,
} from "../../common/constants";
import { deployFromFactory } from "../../common/deployment";
import {
  calculateRollingHash,
  calculateRollingHashFromCollection,
  encodeSendMessage,
  expectEvent,
  expectRevertWithCustomError,
  expectRevertWithReason,
  generateKeccak256Hash,
  generateNKeccak256Hashes,
} from "../../common/helpers";

describe.only("LineaL1Connector", () => {
  let LineaL1Connector: TestLineaL1Connector;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let admin: SignerWithAddress;
  let securityCouncil: SignerWithAddress;
  let l1l2MessageSetter: SignerWithAddress;
  let notAuthorizedAccount: SignerWithAddress;
  let postmanAddress: SignerWithAddress;
  const destinationNetwork = 0n;
  const destinationAddress = "0x5555555555555555555555555555555555555555";

  async function deployLineaL1ConnectorFixture() {
    return deployFromFactory("TestLineaL1Connector") as Promise<TestLineaL1Connector>;
  }

  beforeEach(async () => {
    [admin, securityCouncil, l1l2MessageSetter, notAuthorizedAccount, postmanAddress] = await ethers.getSigners();
    LineaL1Connector = await loadFixture(deployLineaL1ConnectorFixture);
  });

  describe("Add L1->L2 message hashes in 'inboxL1L2MessageStatus'", () => {
    it("Should revert if message hashes array length is zero", async () => {
      const messageHashes: [] = [];

      const anchorCall = LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
        messageHashes,
        1,
        100,
        HASH_ZERO,
      );

      await expectRevertWithCustomError(LineaL1Connector, anchorCall, "MessageHashesListLengthIsZero");
    });

    it("Should update rolling hash and messages emitting events", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 100);
      const expectedRollingHash = calculateRollingHashFromCollection(ethers.ZeroHash, messageHashes.slice(0, 100));

      const anchorCall = LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
        messageHashes,
        1,
        100,
        expectedRollingHash,
      );

      await expectEvent(LineaL1Connector, anchorCall, "L1L2MessageHashesAddedToInbox", [messageHashes]);
      await expectEvent(LineaL1Connector, anchorCall, "RollingHashUpdated", [100, expectedRollingHash]);

      let mappedRollingHash = await LineaL1Connector.l1RollingHashes(100);
      expect(mappedRollingHash).to.equal(expectedRollingHash);

      mappedRollingHash = await LineaL1Connector.l1RollingHashes(100);
      expect(mappedRollingHash).to.equal(expectedRollingHash);

      expect(await LineaL1Connector.lastAnchoredL1MessageNumber()).to.equal(100);
    });

    it("Should not emit events when a second anchoring is duplicated", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 100);
      const expectedRollingHash = calculateRollingHashFromCollection(ethers.ZeroHash, messageHashes.slice(0, 100));

      const anchorCall = LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
        messageHashes,
        1,
        100,
        expectedRollingHash,
      );

      await expectEvent(LineaL1Connector, anchorCall, "L1L2MessageHashesAddedToInbox", [messageHashes]);
      await expectEvent(LineaL1Connector, anchorCall, "RollingHashUpdated", [100, expectedRollingHash]);

      let mappedRollingHash = await LineaL1Connector.l1RollingHashes(100);
      expect(mappedRollingHash).to.equal(expectedRollingHash);

      mappedRollingHash = await LineaL1Connector.l1RollingHashes(100);
      expect(mappedRollingHash).to.equal(expectedRollingHash);

      const transaction = await LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
        messageHashes,
        101,
        100,
        expectedRollingHash,
      );

      const transactionReceipt = await transaction.wait();

      expect(transactionReceipt?.logs).to.be.empty;

      expect(await LineaL1Connector.lastAnchoredL1MessageNumber()).to.equal(100);
    });

    it("Should update rolling hashes mapping ignoring 1 duplicate", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 100);
      const expectedRollingHash = calculateRollingHashFromCollection(ethers.ZeroHash, messageHashes.slice(0, 99));

      // forced duplicate
      messageHashes[99] = messageHashes[98];
      await LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
        messageHashes,
        1,
        99,
        expectedRollingHash,
      );

      let mappedRollingHash = await LineaL1Connector.l1RollingHashes(99);
      expect(mappedRollingHash).to.equal(expectedRollingHash);

      mappedRollingHash = await LineaL1Connector.l1RollingHashes(100);
      expect(mappedRollingHash).to.equal(ethers.ZeroHash);

      expect(await LineaL1Connector.lastAnchoredL1MessageNumber()).to.equal(99);
    });

    it("Should revert when message hashes array length is higher than 100", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 101);

      const anchorCall = LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
        messageHashes,
        1,
        99,
        HASH_ZERO,
      );

      await expectRevertWithCustomError(LineaL1Connector, anchorCall, "MessageHashesListLengthHigherThanOneHundred", [
        101,
      ]);
    });

    it("Should revert when final rolling hash is zero hash", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 100);

      const anchorCall = LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
        messageHashes,
        1,
        99,
        HASH_ZERO,
      );

      await expectRevertWithCustomError(LineaL1Connector, anchorCall, "FinalRollingHashIsZero");
    });

    it("Should revert the with mistmatched hashes", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 100);
      const badRollingHash = calculateRollingHashFromCollection(ethers.ZeroHash, messageHashes);

      const foundRollingHash = calculateRollingHashFromCollection(ethers.ZeroHash, messageHashes.slice(0, 99));

      // forced duplicate
      messageHashes[99] = messageHashes[98];

      await expectRevertWithCustomError(
        LineaL1Connector,
        LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(messageHashes, 1, 99, badRollingHash),
        "L1RollingHashSynchronizationWrong",
        [badRollingHash, foundRollingHash],
      );
    });

    it("Should revert the with mistmatched counts", async () => {
      const messageHashes = generateNKeccak256Hashes("message", 100);

      const foundRollingHash = calculateRollingHashFromCollection(ethers.ZeroHash, messageHashes.slice(0, 99));

      // forced duplicate
      messageHashes[99] = messageHashes[98];

      await expectRevertWithCustomError(
        LineaL1Connector,
        LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(messageHashes, 1, 100, foundRollingHash),
        "L1MessageNumberSynchronizationWrong",
        [100, 99],
      );
    });

    it("Should revert if L1 message number is out of sequence when lastAnchoredL1MessageNumber is higher than zero", async () => {
      await LineaL1Connector.setLastAnchoredL1MessageNumber(100);
      const messageHashes = generateNKeccak256Hashes("message", 100);

      const expectedRollingHash = calculateRollingHashFromCollection(ethers.ZeroHash, messageHashes.slice(0, 99));

      // forced duplicate
      messageHashes[99] = messageHashes[98];

      await expectRevertWithCustomError(
        LineaL1Connector,
        LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
          messageHashes,
          100,
          199,
          expectedRollingHash,
        ),
        "L1MessageNumberSynchronizationWrong",
        [99, 100],
      );
    });

    it("Should update rolling hashes mapping ignoring 1 duplicate when lastAnchoredL1MessageNumber is higher than zero", async () => {
      await LineaL1Connector.setLastAnchoredL1MessageNumber(100);
      const messageHashes = generateNKeccak256Hashes("message", 100);

      const expectedRollingHash = calculateRollingHashFromCollection(ethers.ZeroHash, messageHashes.slice(0, 99));

      // forced duplicate
      messageHashes[99] = messageHashes[98];

      await LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
        messageHashes,
        101,
        199,
        expectedRollingHash,
      );

      let mappedRollingHash = await LineaL1Connector.l1RollingHashes(199);
      expect(mappedRollingHash).to.equal(expectedRollingHash);

      mappedRollingHash = await LineaL1Connector.l1RollingHashes(200);
      expect(mappedRollingHash).to.equal(ethers.ZeroHash);
    });
  });

  describe("Update L1->L2 message status to 'claimed' in 'inboxL1L2MessageStatus'", () => {
    it("Should revert if the message hash has not the status 'received' in 'inboxL1L2MessageStatus' mapping", async () => {
      const messageHash = generateKeccak256Hash("message");

      await expectRevertWithCustomError(
        LineaL1Connector,
        LineaL1Connector.updateL1L2MessageStatusToClaimed(messageHash),
        "MessageDoesNotExistOrHasAlreadyBeenClaimed",
        [messageHash],
      );
    });
  });

  describe("Send message", () => {
    describe("When the contract is not paused", () => {
      it("Should fail when the fee is higher than the amount sent", async () => {
        const sendMessageCall = LineaL1Connector.connect(admin).updateAndCommit(
          destinationNetwork,
          destinationAddress,
          EMPTY_CALLDATA,
          {
            value: MESSAGE_FEE - ethers.parseEther("0.01") + ethers.parseEther("0.0001"),
          },
        );
        await expectRevertWithCustomError(LineaL1Connector, sendMessageCall, "ValueSentTooLow");
      });

      it("Should fail when the coinbase fee transfer fails", async () => {
        await LineaL1Connector.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        await ethers.provider.send("hardhat_setCoinbase", [await LineaL1Connector.getAddress()]);

        const sendMessageCall = LineaL1Connector.connect(admin).updateAndCommit(
          destinationNetwork,
          destinationAddress,
          EMPTY_CALLDATA,
          {
            value: MINIMUM_FEE + MINIMUM_FEE,
          },
        );

        await expectRevertWithCustomError(LineaL1Connector, sendMessageCall, "FeePaymentFailed", [
          await LineaL1Connector.getAddress(),
        ]);

        await ethers.provider.send("hardhat_setCoinbase", [BLOCK_COINBASE]);
      });

      it("Should fail when the minimumFee is higher than the amount sent", async () => {
        await LineaL1Connector.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        const sendMessageCall = LineaL1Connector.connect(admin).updateAndCommit(
          destinationNetwork,
          destinationAddress,
          EMPTY_CALLDATA,
          {
            //.sendMessage(notAuthorizedAccount.address, MESSAGE_FEE, EMPTY_CALLDATA, {
            value: MESSAGE_FEE + ethers.parseEther("0.0001"),
          },
        );

        await expectRevertWithCustomError(LineaL1Connector, sendMessageCall, "FeeTooLow");
      });

      it("Should fail when the to address is address 0", async () => {
        const sendMessageCall = LineaL1Connector.connect(admin).canSendMessage(
          ADDRESS_ZERO,
          MESSAGE_FEE,
          EMPTY_CALLDATA,
          {
            value: MESSAGE_FEE,
          },
        );

        await expectRevertWithCustomError(LineaL1Connector, sendMessageCall, "ZeroAddressNotAllowed");
      });

      it("Should increase the balance of the coinbase with the minimumFee", async () => {
        await LineaL1Connector.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        const initialCoinbaseBalance = await ethers.provider.getBalance(BLOCK_COINBASE);

        await LineaL1Connector.connect(admin).updateAndCommit(destinationNetwork, destinationAddress, EMPTY_CALLDATA, {
          //.sendMessage(notAuthorizedAccount.address, MESSAGE_FEE + MINIMUM_FEE, EMPTY_CALLDATA, {
          value: MINIMUM_FEE + MESSAGE_FEE + ethers.parseEther("0.0001"),
        });

        expect(await ethers.provider.getBalance(BLOCK_COINBASE)).to.be.gt(initialCoinbaseBalance + MINIMUM_FEE);
      });

      it("Should succeed if 'MinimumFeeChanged' event is emitted", async () => {
        const initialMinimumFee = ethers.parseEther("0.0001");

        await expectEvent(
          LineaL1Connector,
          LineaL1Connector.connect(securityCouncil).setMinimumFee(MINIMUM_FEE),
          "MinimumFeeChanged",
          [initialMinimumFee, MINIMUM_FEE, securityCouncil.address],
        );

        // Testing non-zero transition
        await expectEvent(
          LineaL1Connector,
          LineaL1Connector.connect(securityCouncil).setMinimumFee(MINIMUM_FEE + 1n),
          "MinimumFeeChanged",
          [MINIMUM_FEE, MINIMUM_FEE + 1n, securityCouncil.address],
        );
      });

      it("Should succeed if 'MessageSent' event is emitted", async () => {
        await LineaL1Connector.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        const expectedBytes = await encodeSendMessage(
          securityCouncil.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH - MESSAGE_FEE - MINIMUM_FEE,
          1n,
          EMPTY_CALLDATA,
        );
        const messageHash = ethers.keccak256(expectedBytes);

        const sendMessageCall = LineaL1Connector.connect(securityCouncil).updateAndCommit(
          destinationNetwork,
          destinationAddress,
          EMPTY_CALLDATA,
          {
            //.sendMessage(notAuthorizedAccount.address, MESSAGE_FEE + MINIMUM_FEE, EMPTY_CALLDATA, {
            value: MESSAGE_VALUE_1ETH,
          },
        );
        const eventArgs = [
          securityCouncil.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH - MESSAGE_FEE - MINIMUM_FEE,
          1,
          EMPTY_CALLDATA,
          messageHash,
        ];

        await expectEvent(LineaL1Connector, sendMessageCall, "MessageSent", eventArgs);
      });

      it("Should send an ether only message with fees emitting the MessageSent event", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE - ethers.parseEther("0.0001"),
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );
        const messageHash = ethers.keccak256(expectedBytes);

        const eventArgs = [
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE - ethers.parseEther("0.0001"),
          MESSAGE_VALUE_1ETH,
          1,
          EMPTY_CALLDATA,
          messageHash,
        ];
        const sendMessageCall = LineaL1Connector.connect(admin).updateAndCommit(
          destinationNetwork,
          destinationAddress,
          EMPTY_CALLDATA,
          {
            //.sendMessage(notAuthorizedAccount.address, MESSAGE_FEE, EMPTY_CALLDATA, {
            value: MESSAGE_FEE + MESSAGE_VALUE_1ETH,
          },
        );

        await expectEvent(LineaL1Connector, sendMessageCall, "MessageSent", eventArgs);
      });

      it("Should send max limit ether only message with no fee emitting the MessageSent event", async () => {
        const expectedBytes = await encodeSendMessage(
          securityCouncil.address,
          notAuthorizedAccount.address,
          0n,
          INITIAL_WITHDRAW_LIMIT - ethers.parseEther("0.0001"),
          1n,
          EMPTY_CALLDATA,
        );
        const messageHash = ethers.keccak256(expectedBytes);

        const sendMessageCall = LineaL1Connector.connect(securityCouncil).updateAndCommit(
          destinationNetwork,
          destinationAddress,
          EMPTY_CALLDATA,
          {
            //.sendMessage(notAuthorizedAccount.address, ethers.parseEther("0.0001"), EMPTY_CALLDATA, {
            value: INITIAL_WITHDRAW_LIMIT,
          },
        );
        const eventArgs = [
          securityCouncil.address,
          notAuthorizedAccount.address,
          0,
          INITIAL_WITHDRAW_LIMIT - ethers.parseEther("0.0001"),
          1,
          EMPTY_CALLDATA,
          messageHash,
        ];

        await expectEvent(LineaL1Connector, sendMessageCall, "MessageSent", eventArgs);
      });

      it("Should revert with send over max limit amount only", async () => {
        const sendMessageCall = LineaL1Connector.connect(admin).updateAndCommit(
          destinationNetwork,
          destinationAddress,
          EMPTY_CALLDATA,
          {
            //.sendMessage(notAuthorizedAccount.address, ethers.parseEther("0.0001"), EMPTY_CALLDATA, {
            value: INITIAL_WITHDRAW_LIMIT + ethers.parseEther("0.0002"),
          },
        );

        await expectRevertWithCustomError(LineaL1Connector, sendMessageCall, "RateLimitExceeded");
      });

      it("Should revert with send over max limit amount and fees", async () => {
        const sendMessageCall = LineaL1Connector.connect(admin).sendMessage(
          notAuthorizedAccount.address,
          ethers.parseEther("0.0001"),
          EMPTY_CALLDATA,
          {
            value: INITIAL_WITHDRAW_LIMIT + ethers.parseEther("0.0002"),
          },
        );

        await expectRevertWithCustomError(LineaL1Connector, sendMessageCall, "RateLimitExceeded");
      });

      it("Should fail when the rate limit would be exceeded - multi transactions", async () => {
        await LineaL1Connector.connect(admin).sendMessage(
          notAuthorizedAccount.address,
          ethers.parseEther("0.0001"),
          EMPTY_CALLDATA,
          {
            value: MESSAGE_FEE + MESSAGE_VALUE_1ETH + ethers.parseEther("0.0001"),
          },
        );

        const breachingAmount = INITIAL_WITHDRAW_LIMIT - MESSAGE_FEE - MESSAGE_VALUE_1ETH + ethers.parseEther("0.0002");

        const sendMessageCall = LineaL1Connector.connect(admin).sendMessage(
          notAuthorizedAccount.address,
          ethers.parseEther("0.0001"),
          EMPTY_CALLDATA,
          {
            value: breachingAmount,
          },
        );

        await expectRevertWithCustomError(LineaL1Connector, sendMessageCall, "RateLimitExceeded");
      });

      it("Should not accrue rate limit while sending transaction with coinbaseFee only", async () => {
        const initialCoinbaseBalance = await ethers.provider.getBalance(BLOCK_COINBASE);
        await LineaL1Connector.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        const initialRateLimitUsed = await LineaL1Connector.currentPeriodAmountInWei();

        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          0n,
          0n,
          1n,
          EMPTY_CALLDATA,
        );
        const messageHash = ethers.keccak256(expectedBytes);

        const sendMessageCall = LineaL1Connector.connect(admin).sendMessage(
          notAuthorizedAccount.address,
          MINIMUM_FEE,
          EMPTY_CALLDATA,
          { value: MINIMUM_FEE },
        );

        await expectEvent(LineaL1Connector, sendMessageCall, "MessageSent", [
          admin.address,
          notAuthorizedAccount.address,
          0n,
          0n,
          1,
          EMPTY_CALLDATA,
          messageHash,
        ]);

        const postCoinbaseBalance = await ethers.provider.getBalance(BLOCK_COINBASE);
        await expect(postCoinbaseBalance).to.be.gt(initialCoinbaseBalance);

        const postRateLimitUsed = await LineaL1Connector.currentPeriodAmountInWei();
        await expect(postRateLimitUsed).to.be.equal(initialRateLimitUsed);
      });

      it("Should accrue rate limit while sending transaction with 0 value and real fee, postmanFee = fee - coinbaseFee", async () => {
        const initialCoinbaseBalance = await ethers.provider.getBalance(BLOCK_COINBASE);
        const initialRateLimitUsed = await LineaL1Connector.currentPeriodAmountInWei();

        await LineaL1Connector.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_VALUE_1ETH - MINIMUM_FEE,
          0n,
          1n,
          EMPTY_CALLDATA,
        );
        const messageHash = ethers.keccak256(expectedBytes);

        const sendMessageCall = LineaL1Connector.connect(admin).sendMessage(
          notAuthorizedAccount.address,
          MESSAGE_VALUE_1ETH,
          EMPTY_CALLDATA,
          { value: MESSAGE_VALUE_1ETH },
        );

        await expectEvent(LineaL1Connector, sendMessageCall, "MessageSent", [
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_VALUE_1ETH - MINIMUM_FEE,
          0,
          1,
          EMPTY_CALLDATA,
          messageHash,
        ]);

        const postCoinbaseBalance = await ethers.provider.getBalance(BLOCK_COINBASE);

        const postRateLimitUsed = await LineaL1Connector.currentPeriodAmountInWei();

        await expect(postCoinbaseBalance).to.be.gt(initialCoinbaseBalance);
        expect(await postRateLimitUsed).to.be.gt(initialRateLimitUsed);
      });

      it("Should accrue rate limit while sending transaction with value with real fee, postmanFee = fee - coinbaseFee", async () => {
        const initialCoinbaseBalance = await ethers.provider.getBalance(BLOCK_COINBASE);
        const initialRateLimitUsed = await LineaL1Connector.currentPeriodAmountInWei();

        await LineaL1Connector.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          MINIMUM_FEE + MESSAGE_FEE - MINIMUM_FEE,
          MESSAGE_VALUE_1ETH - (MINIMUM_FEE + MESSAGE_FEE),
          1n,
          EMPTY_CALLDATA,
        );
        const messageHash = ethers.keccak256(expectedBytes);

        const sendMessageCall = LineaL1Connector.connect(admin).sendMessage(
          notAuthorizedAccount.address,
          MINIMUM_FEE + MESSAGE_FEE,
          EMPTY_CALLDATA,
          {
            value: MESSAGE_VALUE_1ETH,
          },
        );
        const eventArgs = [
          admin.address,
          notAuthorizedAccount.address,
          MINIMUM_FEE + MESSAGE_FEE - MINIMUM_FEE,
          MESSAGE_VALUE_1ETH - (MINIMUM_FEE + MESSAGE_FEE),
          1,
          EMPTY_CALLDATA,
          messageHash,
        ];

        await expectEvent(LineaL1Connector, sendMessageCall, "MessageSent", eventArgs);

        const postCoinbaseBalance = await ethers.provider.getBalance(BLOCK_COINBASE);

        const postRateLimitUsed = await LineaL1Connector.currentPeriodAmountInWei();

        expect(postCoinbaseBalance).to.be.gt(initialCoinbaseBalance);
        expect(postRateLimitUsed).to.be.gt(initialRateLimitUsed);
      });

      it("Should accrue rate limit while sending transaction with value with coinbaseFee, postmanFee = 0", async () => {
        const initialCoinbaseBalance = await ethers.provider.getBalance(BLOCK_COINBASE);
        const initialRateLimitUsed = await LineaL1Connector.currentPeriodAmountInWei();

        await LineaL1Connector.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          0n,
          MESSAGE_VALUE_1ETH - MINIMUM_FEE,
          1n,
          EMPTY_CALLDATA,
        );
        const messageHash = ethers.keccak256(expectedBytes);

        const sendMessageCall = LineaL1Connector.connect(admin).sendMessage(
          notAuthorizedAccount.address,
          MINIMUM_FEE,
          EMPTY_CALLDATA,
          { value: MESSAGE_VALUE_1ETH },
        );
        const eventArgs = [
          admin.address,
          notAuthorizedAccount.address,
          0n,
          MESSAGE_VALUE_1ETH - MINIMUM_FEE,
          1,
          EMPTY_CALLDATA,
          messageHash,
        ];

        await expectEvent(LineaL1Connector, sendMessageCall, "MessageSent", eventArgs);

        const postCoinbaseBalance = await ethers.provider.getBalance(BLOCK_COINBASE);

        const postRateLimitUsed = await LineaL1Connector.currentPeriodAmountInWei();

        expect(postCoinbaseBalance).to.be.gt(initialCoinbaseBalance);
        expect(postRateLimitUsed).to.be.gt(initialRateLimitUsed);
      });
    });
  });

  describe("Claim message", () => {
    describe("When the contract is not paused", () => {
      it("Should succeed if 'MessageClaimed' event is emitted", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        await LineaL1Connector.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await LineaL1Connector.setLastAnchoredL1MessageNumber(1);
        await LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
          expectedBytesArray,
          2,
          2,
          expectedRollingHash,
        );

        const sendMessageCall = LineaL1Connector.claimMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          EMPTY_CALLDATA,
          1,
        );

        await expectEvent(LineaL1Connector, sendMessageCall, "MessageClaimed", [ethers.keccak256(expectedBytes)]);
      });

      it("Should fail when the message hash does not exist", async () => {
        const expectedBytes = await encodeSendMessage(
          await LineaL1Connector.getAddress(),
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        const messageHash = ethers.keccak256(expectedBytes);

        const claimMessageCall = LineaL1Connector.claimMessage(
          await LineaL1Connector.getAddress(),
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          ADDRESS_ZERO,
          EMPTY_CALLDATA,
          1,
        );

        await expectRevertWithCustomError(
          LineaL1Connector,
          claimMessageCall,
          "MessageDoesNotExistOrHasAlreadyBeenClaimed",
          [messageHash],
        );
      });

      it("Should execute the claim message and send fees to recipient, left over fee to destination", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        const destinationBalance = await ethers.provider.getBalance(notAuthorizedAccount.address);
        const postmanBalance = await ethers.provider.getBalance(postmanAddress.address);

        await LineaL1Connector.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await LineaL1Connector.setLastAnchoredL1MessageNumber(1);
        await LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
          expectedBytesArray,
          2,
          2,
          expectedRollingHash,
        );

        await LineaL1Connector.claimMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          EMPTY_CALLDATA,
          1,
        );
        // greater due to the gas refund
        expect(await ethers.provider.getBalance(notAuthorizedAccount.address)).to.be.greaterThan(
          destinationBalance + MESSAGE_VALUE_1ETH,
        );
        expect(await ethers.provider.getBalance(postmanAddress.address)).to.be.greaterThan(postmanBalance);
      });

      it("Should execute the claim message and send fees to recipient contract and no leftovers", async () => {
        const factory = await ethers.getContractFactory("TestReceivingContract");
        const testContract = (await factory.deploy()) as TestReceivingContract;

        const expectedBytes = await encodeSendMessage(
          admin.address,
          await testContract.getAddress(),
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        const postmanBalance = await ethers.provider.getBalance(postmanAddress.address);

        await LineaL1Connector.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await LineaL1Connector.setLastAnchoredL1MessageNumber(1);
        await LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
          expectedBytesArray,
          2,
          2,
          expectedRollingHash,
        );

        await LineaL1Connector.claimMessage(
          admin.address,
          await testContract.getAddress(),
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          EMPTY_CALLDATA,
          1,
        );
        // greater due to the gas refund
        expect(await ethers.provider.getBalance(await testContract.getAddress())).to.be.equal(MESSAGE_VALUE_1ETH);
        expect(await ethers.provider.getBalance(postmanAddress.address)).to.be.equal(postmanBalance + MESSAGE_FEE);
      });

      it("Should execute the claim message and send the fees to set recipient, and NOT refund fee to EOA", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          LOW_NO_REFUND_MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        const destinationBalance = await ethers.provider.getBalance(notAuthorizedAccount.address);
        const postmanBalance = await ethers.provider.getBalance(postmanAddress.address);

        await LineaL1Connector.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await LineaL1Connector.setLastAnchoredL1MessageNumber(1);
        await LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
          expectedBytesArray,
          2,
          2,
          expectedRollingHash,
        );

        await LineaL1Connector.claimMessage(
          admin.address,
          notAuthorizedAccount.address,
          LOW_NO_REFUND_MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          EMPTY_CALLDATA,
          1,
          { gasPrice: 1000000000 },
        );

        // greater due to the gas refund
        expect(await ethers.provider.getBalance(notAuthorizedAccount.address)).to.be.equal(
          destinationBalance + MESSAGE_VALUE_1ETH,
        );
        expect(await ethers.provider.getBalance(postmanAddress.address)).to.be.equal(
          postmanBalance + LOW_NO_REFUND_MESSAGE_FEE,
        );
      });

      it("Should execute the claim message and send fees to EOA with calldata and no refund sent", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          "0x123456789a",
        );

        const destinationBalance = await ethers.provider.getBalance(notAuthorizedAccount.address);
        const postmanBalance = await ethers.provider.getBalance(postmanAddress.address);

        await LineaL1Connector.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await LineaL1Connector.setLastAnchoredL1MessageNumber(1);
        await LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
          expectedBytesArray,
          2,
          2,
          expectedRollingHash,
        );

        await LineaL1Connector.claimMessage(
          admin.address,
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          "0x123456789a",
          1,
        );
        // greater due to the gas refund
        expect(await ethers.provider.getBalance(notAuthorizedAccount.address)).to.be.equal(
          destinationBalance + MESSAGE_VALUE_1ETH,
        );
        expect(await ethers.provider.getBalance(postmanAddress.address)).to.be.equal(postmanBalance + MESSAGE_FEE);
      });

      it("Should execute the claim message and no fees to EOA with calldata and no refund sent", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          0n,
          MESSAGE_VALUE_1ETH,
          1n,
          "0x123456789a",
        );

        const destinationBalance = await ethers.provider.getBalance(notAuthorizedAccount.address);
        const postmanBalance = await ethers.provider.getBalance(postmanAddress.address);

        await LineaL1Connector.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await LineaL1Connector.setLastAnchoredL1MessageNumber(1);
        await LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
          expectedBytesArray,
          2,
          2,
          expectedRollingHash,
        );

        await LineaL1Connector.claimMessage(
          admin.address,
          notAuthorizedAccount.address,
          0n,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          "0x123456789a",
          1,
        );
        // greater due to the gas refund
        expect(await ethers.provider.getBalance(notAuthorizedAccount.address)).to.be.equal(
          destinationBalance + MESSAGE_VALUE_1ETH,
        );
        expect(await ethers.provider.getBalance(postmanAddress.address)).to.be.equal(postmanBalance);
      });

      it("Should execute the claim message and no fees to EOA with no calldata and no refund sent", async () => {
        const expectedBytes = await encodeSendMessage(
          admin.address,
          notAuthorizedAccount.address,
          0n,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        const destinationBalance = await ethers.provider.getBalance(notAuthorizedAccount.address);
        const postmanBalance = await ethers.provider.getBalance(postmanAddress.address);

        await LineaL1Connector.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await LineaL1Connector.setLastAnchoredL1MessageNumber(1);
        await LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
          expectedBytesArray,
          2,
          2,
          expectedRollingHash,
        );

        await LineaL1Connector.claimMessage(
          admin.address,
          notAuthorizedAccount.address,
          0n,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          EMPTY_CALLDATA,
          1,
        );
        // greater due to the gas refund
        expect(await ethers.provider.getBalance(notAuthorizedAccount.address)).to.be.equal(
          destinationBalance + MESSAGE_VALUE_1ETH,
        );
        expect(await ethers.provider.getBalance(postmanAddress.address)).to.be.equal(postmanBalance);
      });

      // todo - add tests for refund checks when gas is lower

      it("Should fail to send if the contract is paused", async () => {
        await LineaL1Connector.connect(securityCouncil).pauseByType(GENERAL_PAUSE_TYPE);

        const sendMessageCall = LineaL1Connector.connect(admin).canSendMessage(
          notAuthorizedAccount.address,
          0,
          EMPTY_CALLDATA,
          { value: INITIAL_WITHDRAW_LIMIT },
        );

        await expectRevertWithCustomError(LineaL1Connector, sendMessageCall, "IsPaused", [GENERAL_PAUSE_TYPE]);

        const usedAmount = await LineaL1Connector.currentPeriodAmountInWei();
        expect(usedAmount).to.be.equal(0);
      });

      it("Should fail when the message hash has been claimed", async () => {
        const expectedBytes = await encodeSendMessage(
          await LineaL1Connector.getAddress(),
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        await LineaL1Connector.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await LineaL1Connector.setLastAnchoredL1MessageNumber(1);
        await LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
          expectedBytesArray,
          2,
          2,
          expectedRollingHash,
        );

        await LineaL1Connector.claimMessage(
          await LineaL1Connector.getAddress(),
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          postmanAddress.address,
          EMPTY_CALLDATA,
          1,
        );
        await expect(
          LineaL1Connector.claimMessage(
            await LineaL1Connector.getAddress(),
            notAuthorizedAccount.address,
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            postmanAddress.address,
            EMPTY_CALLDATA,
            1,
          ),
        ).to.be.revertedWithCustomError(LineaL1Connector, "MessageDoesNotExistOrHasAlreadyBeenClaimed");
      });

      it("Should execute the claim message and send the fees to msg.sender", async () => {
        const expectedBytes = await encodeSendMessage(
          await LineaL1Connector.getAddress(),
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        const expectedSecondBytes = await encodeSendMessage(
          await LineaL1Connector.getAddress(),
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          2n,
          EMPTY_CALLDATA,
        );

        const destinationBalance = await ethers.provider.getBalance(notAuthorizedAccount.address);

        await LineaL1Connector.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes), ethers.keccak256(expectedSecondBytes)];
        const expectedRollingHash = calculateRollingHashFromCollection(ethers.ZeroHash, expectedBytesArray);

        await LineaL1Connector.setLastAnchoredL1MessageNumber(1);
        await LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
          expectedBytesArray,
          2,
          3,
          expectedRollingHash,
        );

        await LineaL1Connector.connect(admin).claimMessage(
          await LineaL1Connector.getAddress(),
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          ADDRESS_ZERO,
          EMPTY_CALLDATA,
          1,
        );

        const adminBalance = await ethers.provider.getBalance(admin.address);

        await LineaL1Connector.connect(admin).claimMessage(
          await LineaL1Connector.getAddress(),
          notAuthorizedAccount.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          ADDRESS_ZERO,
          EMPTY_CALLDATA,
          2,
        );

        expect(await ethers.provider.getBalance(notAuthorizedAccount.address)).to.be.greaterThan(
          destinationBalance + MESSAGE_VALUE_1ETH + MESSAGE_VALUE_1ETH,
        );
        expect(await ethers.provider.getBalance(admin.address)).to.be.lessThan(adminBalance + MESSAGE_FEE);

        expect(await LineaL1Connector.inboxL1L2MessageStatus(ethers.keccak256(expectedBytes))).to.be.equal(
          INBOX_STATUS_CLAIMED,
        );
      });

      // todo also add lower than 5000 gas check for the balances to be equal

      it("Should execute the claim message when there are no fees", async () => {
        const expectedBytes = await encodeSendMessage(
          await LineaL1Connector.getAddress(),
          notAuthorizedAccount.address,
          0n,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );
        const destinationBalance = await ethers.provider.getBalance(notAuthorizedAccount.address);

        await LineaL1Connector.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await LineaL1Connector.setLastAnchoredL1MessageNumber(1);
        await LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
          expectedBytesArray,
          2,
          2,
          expectedRollingHash,
        );

        const adminBalance = await ethers.provider.getBalance(admin.address);
        await LineaL1Connector.connect(admin).claimMessage(
          await LineaL1Connector.getAddress(),
          notAuthorizedAccount.address,
          0,
          MESSAGE_VALUE_1ETH,
          ADDRESS_ZERO,
          EMPTY_CALLDATA,
          1,
        );

        expect(await ethers.provider.getBalance(notAuthorizedAccount.address)).to.be.equal(
          destinationBalance + MESSAGE_VALUE_1ETH,
        );
        expect(await ethers.provider.getBalance(admin.address)).to.be.lessThan(adminBalance);

        expect(await LineaL1Connector.inboxL1L2MessageStatus(ethers.keccak256(expectedBytes))).to.be.equal(
          INBOX_STATUS_CLAIMED,
        );
      });

      it("Should provide the correct origin sender", async () => {
        const sendCalldata = generateKeccak256Hash("setSender()").substring(0, 10);

        const expectedBytes = await encodeSendMessage(
          await LineaL1Connector.getAddress(),
          await LineaL1Connector.getAddress(),
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          sendCalldata,
        );

        await LineaL1Connector.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await LineaL1Connector.setLastAnchoredL1MessageNumber(1);
        await LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
          expectedBytesArray,
          2,
          2,
          expectedRollingHash,
        );

        const storedSenderBeforeSending = await LineaL1Connector.originalSender();
        expect(storedSenderBeforeSending).to.be.equal(ADDRESS_ZERO);

        await expect(
          LineaL1Connector.connect(admin).claimMessage(
            await LineaL1Connector.getAddress(),
            await LineaL1Connector.getAddress(),
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            ADDRESS_ZERO,
            sendCalldata,
            1,
          ),
        ).to.not.be.reverted;

        const newSender = await LineaL1Connector.originalSender();
        expect(newSender).to.be.equal(await LineaL1Connector.getAddress());
      });

      it("Should fail on reentry when sending to recipient", async () => {
        const callSignature = generateKeccak256Hash("doReentry()").substring(0, 10);

        const expectedBytes = await encodeSendMessage(
          await LineaL1Connector.getAddress(),
          await LineaL1Connector.getAddress(),
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          callSignature,
        );

        await LineaL1Connector.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await LineaL1Connector.setLastAnchoredL1MessageNumber(1);
        await LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
          expectedBytesArray,
          2,
          2,
          expectedRollingHash,
        );

        const claimMessageCall = LineaL1Connector.connect(admin).claimMessage(
          await LineaL1Connector.getAddress(),
          await LineaL1Connector.getAddress(),
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          ADDRESS_ZERO,
          callSignature,
          1,
        );

        await expectRevertWithReason(claimMessageCall, "ReentrancyGuard: reentrant call");
      });

      it("Should fail when the destination errors through receive", async () => {
        const expectedBytes = await encodeSendMessage(
          await LineaL1Connector.getAddress(),
          await LineaL1Connector.getAddress(),
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        await LineaL1Connector.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await LineaL1Connector.setLastAnchoredL1MessageNumber(1);
        await LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
          expectedBytesArray,
          2,
          2,
          expectedRollingHash,
        );

        await expect(
          LineaL1Connector.connect(admin).claimMessage(
            await LineaL1Connector.getAddress(),
            await LineaL1Connector.getAddress(),
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            ADDRESS_ZERO,
            EMPTY_CALLDATA,
            1,
          ),
        ).to.be.reverted;

        expect(await LineaL1Connector.inboxL1L2MessageStatus(ethers.keccak256(expectedBytes))).to.be.equal(
          INBOX_STATUS_RECEIVED,
        );
      });

      it("Should fail when the destination errors through fallback", async () => {
        const expectedBytes = await encodeSendMessage(
          await LineaL1Connector.getAddress(),
          await LineaL1Connector.getAddress(),
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          "0x1234",
        );

        await LineaL1Connector.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await LineaL1Connector.setLastAnchoredL1MessageNumber(1);
        await LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
          expectedBytesArray,
          2,
          2,
          expectedRollingHash,
        );

        await expect(
          LineaL1Connector.connect(admin).claimMessage(
            await LineaL1Connector.getAddress(),
            await LineaL1Connector.getAddress(),
            MESSAGE_FEE,
            MESSAGE_VALUE_1ETH,
            ADDRESS_ZERO,
            "0x1234",
            1,
          ),
        ).to.be.reverted;

        expect(await LineaL1Connector.inboxL1L2MessageStatus(ethers.keccak256(expectedBytes))).to.be.equal(
          INBOX_STATUS_RECEIVED,
        );
      });

      it("Should fail when the destination errors on empty receive (makeItReceive function)", async () => {
        const expectedBytes = await encodeSendMessage(
          await LineaL1Connector.getAddress(),
          await LineaL1Connector.getAddress(),
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          "0xfc13b6f3",
        );

        await LineaL1Connector.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await LineaL1Connector.setLastAnchoredL1MessageNumber(1);
        await LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
          expectedBytesArray,
          2,
          2,
          expectedRollingHash,
        );

        const claimMessageCall = LineaL1Connector.connect(admin).claimMessage(
          await LineaL1Connector.getAddress(),
          await LineaL1Connector.getAddress(),
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          ADDRESS_ZERO,
          "0xfc13b6f3",
          1,
        );

        await expectRevertWithCustomError(LineaL1Connector, claimMessageCall, "MessageSendingFailed", [
          await LineaL1Connector.getAddress(),
        ]);

        expect(await LineaL1Connector.inboxL1L2MessageStatus(ethers.keccak256(expectedBytes))).to.be.equal(
          INBOX_STATUS_RECEIVED,
        );
      });

      it("Should fail when the fee recipient fails errors", async () => {
        const expectedBytes = await encodeSendMessage(
          await LineaL1Connector.getAddress(),
          admin.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          1n,
          EMPTY_CALLDATA,
        );

        await LineaL1Connector.addFunds({ value: INITIAL_WITHDRAW_LIMIT });

        const expectedBytesArray = [ethers.keccak256(expectedBytes)];
        const expectedRollingHash = calculateRollingHash(ethers.ZeroHash, ethers.keccak256(expectedBytes));

        await LineaL1Connector.setLastAnchoredL1MessageNumber(1);
        await LineaL1Connector.connect(l1l2MessageSetter).anchorL1L2MessageHashes(
          expectedBytesArray,
          2,
          2,
          expectedRollingHash,
        );

        const claimMessageCall = LineaL1Connector.connect(admin).claimMessage(
          await LineaL1Connector.getAddress(),
          admin.address,
          MESSAGE_FEE,
          MESSAGE_VALUE_1ETH,
          await LineaL1Connector.getAddress(),
          EMPTY_CALLDATA,
          1,
        );

        await expectRevertWithCustomError(LineaL1Connector, claimMessageCall, "FeePaymentFailed", [
          await LineaL1Connector.getAddress(),
        ]);

        expect(await LineaL1Connector.inboxL1L2MessageStatus(ethers.keccak256(expectedBytes))).to.be.equal(
          INBOX_STATUS_RECEIVED,
        );
      });
    });
  });

  describe("Set minimum fee", () => {
    it("Should fail when caller is not allowed", async () => {
      await expect(LineaL1Connector.connect(notAuthorizedAccount).setMinimumFee(MINIMUM_FEE)).to.be.revertedWith(
        "AccessControl: account " +
          notAuthorizedAccount.address.toLowerCase() +
          " is missing role " +
          MINIMUM_FEE_SETTER_ROLE,
      );
    });

    it("Should set the minimum fee", async () => {
      await LineaL1Connector.connect(securityCouncil).setMinimumFee(MINIMUM_FEE);

      expect(await LineaL1Connector.minimumFeeInWei()).to.be.equal(MINIMUM_FEE);
    });
  });
});
