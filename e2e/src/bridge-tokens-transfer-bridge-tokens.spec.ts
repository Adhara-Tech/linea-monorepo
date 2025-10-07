import { ethers } from "ethers";
import { describe, expect, it } from "@jest/globals";
import { config } from "./config/tests-config";
import { waitForEvents, etherToWei, getWallet, LineaEstimateGasClient } from "./common/utils";
import { MESSAGE_SENT_EVENT_SIGNATURE } from "./common/constants";

const l1AccountManager = config.getL1AccountManager();
const l2AccountManager = config.getL2AccountManager();
const bridgeAmount = ethers.parseEther("110");
const transferAmount = ethers.parseEther("10");
const bridgeBackAmount = ethers.parseEther("100");
const messageSentEventMessageNumberIndex = 4;
const messageSentEventMessageHashIndex = 6;

describe("New test", () => {
  it.concurrent("Bridge a token from L1 to L2 and transfer and bridge a token from L2 to L1", async () => {
    const [l1Account, l2Account] = await Promise.all([
      l1AccountManager.generateAccount(),
      l2AccountManager.generateAccount(),
    ]);

    const lineaRollup = config.getLineaRollupContract();
    const l2MessageService = config.getL2MessageServiceContract();
    const l1TokenBridge = config.getL1TokenBridgeContract();
    const l2TokenBridge = config.getL2TokenBridgeContract();
    const l1Token = config.getL1TokenContract();
    const l1Provider = config.getL1Provider();

    console.log("Minting ERC20 tokens to L1 Account");

    let { maxPriorityFeePerGas: l1MaxPriorityFeePerGas, maxFeePerGas: l1MaxFeePerGas } = await l1Provider.getFeeData();
    let nonce = await l1Provider.getTransactionCount(l1Account.address, "pending");

    console.log("Minting and approving tokens to L1 TokenBridge");

    await Promise.all([
      (
        await l1Token.connect(l1Account).mint(l1Account.address, bridgeAmount, {
          nonce: nonce,
          maxPriorityFeePerGas: l1MaxPriorityFeePerGas,
          maxFeePerGas: l1MaxFeePerGas,
        })
      ).wait(),
      (
        await l1Token.connect(l1Account).approve(l1TokenBridge.getAddress(), bridgeAmount, {
          maxPriorityFeePerGas: l1MaxPriorityFeePerGas,
          maxFeePerGas: l1MaxFeePerGas,
          nonce: nonce + 1,
        })
      ).wait(),
    ]);

    const l1TokenBridgeAddress = await l1TokenBridge.getAddress();
    const l1TokenAddress = await l1Token.getAddress();

    const allowanceL1Account = await l1Token.allowance(l1Account.address, l1TokenBridgeAddress);
    console.log(`Current allowance of L1 account to L1 TokenBridge is ${allowanceL1Account.toString()}`);

    console.log("Calling the bridgeToken function on the L1 TokenBridge contract");

    ({ maxPriorityFeePerGas: l1MaxPriorityFeePerGas, maxFeePerGas: l1MaxFeePerGas } = await l1Provider.getFeeData());
    nonce = await l1Provider.getTransactionCount(l1Account.address, "pending");

    const bridgeTokenTx = await l1TokenBridge
      .connect(l1Account)
      .bridgeToken(l1TokenAddress, bridgeAmount, l2Account.address, {
        value: etherToWei("0.01"),
        maxPriorityFeePerGas: l1MaxPriorityFeePerGas,
        maxFeePerGas: l1MaxFeePerGas,
        nonce: nonce,
      });

    const bridgedTxReceipt = await bridgeTokenTx.wait();

    let sentEventLog = bridgedTxReceipt?.logs.find((log) => log.topics[0] == MESSAGE_SENT_EVENT_SIGNATURE);

    let messageSentEvent = lineaRollup.interface.decodeEventLog(
      "MessageSent",
      sentEventLog!.data,
      sentEventLog!.topics,
    );

    let l1TokenBalance = await l1Token.balanceOf(l1Account.address);
    console.log(`Token balance of L1 account is ${l1TokenBalance.toString()}`);

    expect(l1TokenBalance).toEqual(0n);

    console.log("Waiting for MessageSent event on L1.");

    const messageNumber = messageSentEvent[messageSentEventMessageNumberIndex];
    let messageHash = messageSentEvent[messageSentEventMessageHashIndex];

    console.log(`Message sent on L1. messageHash=${messageHash}`);

    console.log("Waiting for anchoring...");

    const [rollingHashUpdatedEvent] = await waitForEvents(
      l2MessageService,
      l2MessageService.filters.RollingHashUpdated(),
      1_000,
      0,
      "latest",
      async (events) => events.filter((event) => event.args.messageNumber >= messageNumber),
    );
    expect(rollingHashUpdatedEvent).not.toBeNull();

    const anchoredStatus = await l2MessageService.inboxL1L2MessageStatus(messageHash);

    expect(anchoredStatus).toBeGreaterThan(0);

    console.log(`Message anchored. event=${JSON.stringify(rollingHashUpdatedEvent)}`);

    console.log("Waiting for MessageClaimed event on L2...");

    let [claimedEvent] = await waitForEvents(l2MessageService, l2MessageService.filters.MessageClaimed(messageHash));
    expect(claimedEvent).not.toBeNull();

    const [newTokenDeployed] = await waitForEvents(l2TokenBridge, l2TokenBridge.filters.NewTokenDeployed());
    expect(newTokenDeployed).not.toBeNull();

    console.log(`Message claimed on L2. event=${JSON.stringify(claimedEvent)}.`);

    const l2Token = config.getL2BridgedTokenContract(newTokenDeployed.args.bridgedToken);
    console.log({ l2Token });

    console.log("Verify the token balance on L2");

    let l2TokenBalance = await l2Token.balanceOf(l2Account.address);
    console.log(`Token balance of L2 account is ${l2TokenBalance.toString()}`);

    expect(l2TokenBalance).toEqual(bridgeAmount);

    const l2Provider = config.getL2Provider();

    // Transferring tokens
    console.log("Transferring tokens from L2 account 1 to L2 account 2");
    const l2Account2 = await l2AccountManager.generateAccount();

    const { maxPriorityFeePerGas: l2MaxPriorityFeePerGas, maxFeePerGas: l2MaxFeePerGas } =
      await l2Provider.getFeeData();
    const l2Nonce = await l2Provider.getTransactionCount(l2Account.address, "pending");

    await Promise.all([
      (
        await l2Token.connect(l2Account).transfer(l2Account2.address, transferAmount, {
          nonce: l2Nonce,
          maxPriorityFeePerGas: l2MaxPriorityFeePerGas,
          maxFeePerGas: l2MaxFeePerGas,
        })
      ).wait(),
    ]);

    l2TokenBalance = await l2Token.balanceOf(l2Account.address);
    console.log(`Token balance of L2 account is ${l2TokenBalance.toString()}`);

    const l2TokenBalance2 = await l2Token.balanceOf(l2Account2.address);
    console.log(`Token balance of L2 account 2 is ${l2TokenBalance2.toString()}`);

    console.log("Setting custom contract");
    const admin = getWallet(
      "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
      config.getL1Provider()!,
    );
    console.log({ admin });

    const adminBalance = await l1Provider.getBalance(admin.address);
    console.log(adminBalance);

    nonce = await l1Provider.getTransactionCount(admin.address, "pending");

    //const l2Token = config.getL2TokenContract();
    const l2TokenAddress = await l2Token.getAddress();

    const tx = await l1TokenBridge.connect(admin).setCustomContract(l2TokenAddress, l1TokenAddress, {
      maxPriorityFeePerGas: l1MaxPriorityFeePerGas,
      maxFeePerGas: l1MaxFeePerGas,
      nonce: nonce,
    });
    console.log({ tx });

    console.log("Bridge a token from L2 to L1");

    const lineaEstimateGasClient = new LineaEstimateGasClient(config.getL2BesuNodeEndpoint()!);
    const l2TokenBridgeAddress = await l2TokenBridge.getAddress();

    // Approve token
    let lineaEstimateGasFee = await lineaEstimateGasClient.lineaEstimateGas(
      l2Account.address,
      l2TokenAddress,
      l2Token.interface.encodeFunctionData("approve", [l2TokenBridgeAddress, bridgeBackAmount]),
    );
    console.log({ lineaEstimateGasFee });
    nonce = await l2Provider.getTransactionCount(l2Account.address, "pending");
    const approveResponse = await l2Token.connect(l2Account).approve(l2TokenBridgeAddress, bridgeBackAmount, {
      maxPriorityFeePerGas: lineaEstimateGasFee.maxPriorityFeePerGas,
      maxFeePerGas: lineaEstimateGasFee.maxFeePerGas,
      gasLimit: lineaEstimateGasFee.gasLimit,
      nonce: nonce,
    });
    const approveTxReceipt = await approveResponse.wait();
    console.log(`Approve tx receipt received=${JSON.stringify(approveTxReceipt)}`);

    // Retrieve token allowance
    const allowanceL2Account = await l2Token.allowance(l2Account.address, l2TokenBridgeAddress);
    console.log(`Current allowance of L2 account to L2 TokenBridge is ${allowanceL2Account.toString()}`);
    console.log(`Current balance of L2 account is ${await l2Token.balanceOf(l2Account)}`);

    console.log("Calling the bridgeToken function on the L2 TokenBridge contract");

    // Bridge token
    console.log(`0.01 ether = ${etherToWei("0.01").toString(16)}`);
    nonce = await l2Provider.getTransactionCount(l2Account.address, "pending");

    lineaEstimateGasFee = await lineaEstimateGasClient.lineaEstimateGas(
      l2Account.address,
      l2TokenBridgeAddress,
      l2TokenBridge.interface.encodeFunctionData("bridgeToken", [l2TokenAddress, bridgeBackAmount, l1Account.address]),
      etherToWei("0.01").toString(16),
    );

    const bridgeResponse = await l2TokenBridge
      .connect(l2Account)
      .bridgeToken(await l2Token.getAddress(), bridgeBackAmount, l1Account.address, {
        value: etherToWei("0.01"),
        maxPriorityFeePerGas: lineaEstimateGasFee.maxPriorityFeePerGas,
        maxFeePerGas: lineaEstimateGasFee.maxFeePerGas,
        gasLimit: lineaEstimateGasFee.gasLimit,
        nonce: nonce,
      });
    const bridgeTxReceipt = await bridgeResponse.wait();
    console.log(`Bridge tx receipt received=${JSON.stringify(bridgeTxReceipt)}`);

    sentEventLog = bridgeTxReceipt?.logs.find((log) => log.topics[0] == MESSAGE_SENT_EVENT_SIGNATURE);

    messageSentEvent = l2MessageService.interface.decodeEventLog(
      "MessageSent",
      sentEventLog!.data,
      sentEventLog!.topics,
    );
    messageHash = messageSentEvent[messageSentEventMessageHashIndex];

    console.log("Waiting for L1 MessageClaimed event.");

    [claimedEvent] = await waitForEvents(lineaRollup, lineaRollup.filters.MessageClaimed(messageHash));
    expect(claimedEvent).not.toBeNull();

    console.log(`Message claimed on L1. event=${JSON.stringify(claimedEvent)}`);

    console.log("Verify the token balance on L1");

    l1TokenBalance = await l1Token.balanceOf(l1Account.address);
    console.log(`Token balance of L1 account is ${l1TokenBalance.toString()}`);

    expect(l1TokenBalance).toEqual(bridgeBackAmount);
  });
});
