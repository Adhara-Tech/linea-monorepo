import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { TestConnectorBase } from "../../../typechain-types";
import { INITIALIZED_ERROR_MESSAGE } from "../common/constants";
import { deployUpgradableFromFactory } from "../common/deployment";
import { expectEvent, expectRevertWithCustomError, expectRevertWithReason } from "../common/helpers";

describe("ConnectorBase", () => {
  let connectorBase: TestConnectorBase;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let admin: SignerWithAddress;
  let remoteSender: SignerWithAddress;

  async function deployConnectorBaseFixture() {
    const connectorBase = (await deployUpgradableFromFactory("TestConnectorBase", [
      //      await messageService.getAddress(),
      remoteSender.address,
    ])) as unknown as TestConnectorBase;
    return { connectorBase };
  }

  beforeEach(async () => {
    [admin, remoteSender] = await ethers.getSigners();
    const contracts = await loadFixture(deployConnectorBaseFixture);
    connectorBase = contracts.connectorBase;
  });

  describe("Initialization checks", () => {
    it("Should revert if message service address is address(0)", async () => {
      await expectRevertWithCustomError(
        messageService,
        deployUpgradableFromFactory("TestMessageServiceBase", [ethers.ZeroAddress, remoteSender.address]),
        "ZeroAddressNotAllowed",
      );
    });

    it("It should fail when not initializing", async () => {
      await expectRevertWithReason(
        connectorBase.tryInitialize(await messageService.getAddress(), remoteSender.address),
        INITIALIZED_ERROR_MESSAGE,
      );
    });

    it("Should revert if remote sender address is address(0)", async () => {
      await expectRevertWithCustomError(
        connectorBase,
        deployUpgradableFromFactory("TestMessageServiceBase", [await messageService.getAddress(), ethers.ZeroAddress]),
        "ZeroAddressNotAllowed",
      );
    });

    it("Should set the value of remoteSender variable in storage", async () => {
      expect(await connectorBase.remoteSender()).to.equal(remoteSender.address);
    });

    it("Should set the value of messageService variable in storage", async () => {
      expect(await connectorBase.messageService()).to.equal(await messageService.getAddress());
    });
  });

  describe("RemoteSenderSet event", () => {
    it("Should emit RemoteSenderSet event when testSetRemoteSender is called", async () => {
      const newRemoteSender = ethers.Wallet.createRandom().address;
      await expectEvent(connectorBase, connectorBase.testSetRemoteSender(newRemoteSender), "RemoteSenderSet", [
        newRemoteSender,
        admin.address,
      ]);
    });
  });

  describe("onlyMessagingService() modifier", () => {
    it("Should revert if msg.sender is not the message service address", async () => {
      await expectRevertWithCustomError(
        connectorBase,
        connectorBase.withOnlyMessagingService(),
        "CallerIsNotMessageService",
      );
    });

    it("Should succeed if msg.sender is the message service address", async () => {
      expect(await messageService.callMessageServiceBase(await connectorBase.getAddress())).to.not.be.reverted;
    });
  });

  describe("onlyAuthorizedRemoteSender() modifier", () => {
    it("Should revert if sender is not allowed", async () => {
      await expectRevertWithCustomError(
        connectorBase,
        connectorBase.withOnlyAuthorizedRemoteSender(),
        "SenderNotAuthorized",
      );
    });

    it("Should succeed if original sender is allowed", async () => {
      const messageServiceBase = (await deployUpgradableFromFactory("TestMessageServiceBase", [
        await messageService.getAddress(),
        "0x00000000000000000000000000000000075BCd15",
      ])) as unknown as TestMessageServiceBase;
      await expect(messageServiceBase.withOnlyAuthorizedRemoteSender()).to.not.be.reverted;
    });
  });
});
