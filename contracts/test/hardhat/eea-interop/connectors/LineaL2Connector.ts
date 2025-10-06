import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { TestLineaL2Connector } from "../../../../typechain-types";
import { deployFromFactory } from "../../common/deployment";
import { generateL2MessagingBlocksOffsets, generateRandomBytes, range } from "../../common/helpers";

describe.only("LineaL2Connector", () => {
  let LineaL2Connector: TestLineaL2Connector;

  async function deployTestLineaL2ConnectorFixture(): Promise<TestLineaL2Connector> {
    return deployFromFactory("TestLineaL2Connector") as Promise<TestLineaL2Connector>;
  }

  beforeEach(async () => {
    LineaL2Connector = await loadFixture(deployTestLineaL2ConnectorFixture);
  });

  describe("Set L2->L1 message status in '_messageClaimedBitMap' mapping to 'claimed'", () => {
    it("Should failed if message has already been claimed", async () => {
      const messageNumber = 1;
      await LineaL2Connector.setL2L1MessageToClaimed(messageNumber);

      await expect(LineaL2Connector.setL2L1MessageToClaimed(messageNumber))
        .to.be.revertedWithCustomError(LineaL2Connector, "MessageAlreadyClaimed")
        .withArgs(messageNumber);
    });

    it("Should set the message as claimed", async () => {
      const messagesNumber = [1, 2, 3];
      const [firstMessage, secondMessage, thirdMessage] = messagesNumber;

      await Promise.all([
        LineaL2Connector.setL2L1MessageToClaimed(firstMessage),
        LineaL2Connector.setL2L1MessageToClaimed(secondMessage),
        LineaL2Connector.setL2L1MessageToClaimed(thirdMessage),
      ]);

      const messagesStatus = await Promise.all([
        LineaL2Connector.isMessageClaimed(firstMessage),
        LineaL2Connector.isMessageClaimed(secondMessage),
        LineaL2Connector.isMessageClaimed(thirdMessage),
      ]);

      expect(messagesStatus).to.deep.equal([true, true, true]);
    });
  });

  describe("Add L2 merkle root in 'l2MerkleRootsDepths' mapping", () => {
    it("Should revert if the merkle root already exists", async () => {
      const merkleRoot = generateRandomBytes(32);
      const treeDepth = 32;

      await LineaL2Connector.addL2MerkleRoots([merkleRoot], treeDepth);
      await expect(LineaL2Connector.addL2MerkleRoots([merkleRoot], treeDepth))
        .to.be.revertedWithCustomError(LineaL2Connector, "L2MerkleRootAlreadyAnchored")
        .withArgs(merkleRoot);
    });

    it("Should add the new root to contract storage and emit a 'L2MerkleRootAdded' event", async () => {
      const merkleRoot = generateRandomBytes(32);
      const treeDepth = 32;

      await expect(LineaL2Connector.addL2MerkleRoots([merkleRoot], treeDepth))
        .to.emit(LineaL2Connector, "L2MerkleRootAdded")
        .withArgs(merkleRoot, treeDepth);

      expect(await LineaL2Connector.l2MerkleRootsDepths(merkleRoot)).to.not.equal(0);
    });
  });

  describe("Anchor L2 messaging blocks on L1", () => {
    it("Should fail when '_l2MessagingBlocksOffsets' length is not a multiple of 2", async () => {
      const currentL2BlockNumber = 10n;
      await expect(LineaL2Connector.anchorL2MessagingBlocks("0x01", currentL2BlockNumber))
        .to.be.revertedWithCustomError(LineaL2Connector, "BytesLengthNotMultipleOfTwo")
        .withArgs(1);
    });

    it("Should not emit events when '_l2MessagingBlocksOffsets' is empty", async () => {
      const currentL2BlockNumber = 10n;
      await expect(LineaL2Connector.anchorL2MessagingBlocks("0x", currentL2BlockNumber)).to.not.emit(
        LineaL2Connector,
        "L2MessagingBlockAnchored",
      );
    });

    it("Should anchor L2 messaging blocks on L1 when the input is not an empty array", async () => {
      const currentL2BlockNumber = 10_000_000n;

      const arr = range(1, 50);
      const l2MessagingBlocks = generateL2MessagingBlocksOffsets(1, 50);

      const transaction = await LineaL2Connector.anchorL2MessagingBlocks(l2MessagingBlocks, currentL2BlockNumber);
      const receipt = await transaction.wait();

      expect(receipt).to.not.be.undefined;
      const events = await LineaL2Connector.queryFilter(LineaL2Connector.filters.L2MessagingBlockAnchored());

      expect(events.length).to.equal(50);

      for (let i = 0; i < events.length; i++) {
        expect(events[i].args?.l2Block).to.deep.equal(currentL2BlockNumber + BigInt(arr[i]));
      }
    });
  });

  describe("Check if L2->L1 message has been claimed on L1 or not", () => {
    it("Should return false if the message has not been claimed", async () => {
      const messageNumber = 1;
      expect(await LineaL2Connector.isMessageClaimed(messageNumber)).to.equal(false);
    });

    it("Should return true if the message has been claimed", async () => {
      const messageNumber = 1;
      await LineaL2Connector.setL2L1MessageToClaimed(messageNumber);
      expect(await LineaL2Connector.isMessageClaimed(messageNumber)).to.equal(true);
    });
  });
});
