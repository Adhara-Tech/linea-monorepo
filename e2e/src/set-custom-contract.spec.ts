import { ethers } from "ethers";
import { describe, it } from "@jest/globals";
import { waitForEvents, etherToWei, getWallet, LineaEstimateGasClient } from "./common/utils";
import { config } from "./config/tests-config";
import { MESSAGE_SENT_EVENT_SIGNATURE } from "./common/constants";

const l1AccountManager = config.getL1AccountManager();
const l2AccountManager = config.getL2AccountManager();

const bridgeAmount = ethers.parseEther("100");
const messageSentEventMessageHashIndex = 6;

describe("Set custom contract", () => {
  it.concurrent("Bridge a token from L1 to L2 and then back from L2 to L1", async () => {
    const [l1Account, l2Account] = await Promise.all([
      l1AccountManager.generateAccount(),
      l2AccountManager.generateAccount(),
    ]);

    const lineaRollup = config.getLineaRollupContract();
    const l2MessageService = config.getL2MessageServiceContract();
    const l1TokenBridge = config.getL1TokenBridgeContract();
    const l2TokenBridge = config.getL2TokenBridgeContract();
    const l1Token = config.getL1TokenContract();
    const l2Token = config.getL2TokenContract();
    const l1Provider = config.getL1Provider();
    const l2Provider = config.getL2Provider();
    const lineaEstimateGasClient = new LineaEstimateGasClient(config.getL2BesuNodeEndpoint()!);

    const l1TokenAddress = await l1Token.getAddress();
    const l2TokenAddress = await l2Token.getAddress();
    const l2TokenBridgeAddress = await l2TokenBridge.getAddress();

    const admin = getWallet(
      "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
      config.getL1Provider()!,
    );
    console.log({ admin });

    const adminBalance = await l1Provider.getBalance(admin.address);
    console.log(adminBalance);

    const { maxPriorityFeePerGas: l1maxPriorityFeePerGas, maxFeePerGas: l1maxFeePerGas } =
      await l1Provider.getFeeData();
    const l1nonce = await l1Provider.getTransactionCount(admin.address, "pending");

    console.log("Setting custom contract");
    const tx = await l1TokenBridge.connect(admin).setCustomContract(l2TokenAddress, l1TokenAddress, {
      maxPriorityFeePerGas: l1maxPriorityFeePerGas,
      maxFeePerGas: l1maxFeePerGas,
      nonce: l1nonce,
    });
    console.log({ tx });

    // Mint token
    let lineaEstimateGasFee = await lineaEstimateGasClient.lineaEstimateGas(
      l2Account.address,
      l2TokenAddress,
      l2Token.interface.encodeFunctionData("mint", [l2Account.address, bridgeAmount]),
    );
    let nonce = await l2Provider.getTransactionCount(l2Account.address, "pending");
    const mintResponse = await l2Token.connect(l2Account).mint(l2Account.address, bridgeAmount, {
      maxPriorityFeePerGas: lineaEstimateGasFee.maxPriorityFeePerGas,
      maxFeePerGas: lineaEstimateGasFee.maxFeePerGas,
      gasLimit: lineaEstimateGasFee.gasLimit,
      nonce: nonce,
    });
    const mintTxReceipt = await mintResponse.wait();
    console.log(`Mint tx receipt received=${JSON.stringify(mintTxReceipt)}`);

    // Approve token
    lineaEstimateGasFee = await lineaEstimateGasClient.lineaEstimateGas(
      l2Account.address,
      l2TokenAddress,
      l2Token.interface.encodeFunctionData("approve", [l2TokenBridgeAddress, ethers.parseEther("100")]),
    );
    nonce = await l2Provider.getTransactionCount(l2Account.address, "pending");
    const approveResponse = await l2Token.connect(l2Account).approve(l2TokenBridgeAddress, ethers.parseEther("100"), {
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
      l2TokenBridge.interface.encodeFunctionData("bridgeToken", [l2TokenAddress, bridgeAmount, l1Account.address]),
      etherToWei("0.01").toString(16),
    );

    const bridgeResponse = await l2TokenBridge
      .connect(l2Account)
      .bridgeToken(await l2Token.getAddress(), bridgeAmount, l1Account.address, {
        value: etherToWei("0.01"),
        maxPriorityFeePerGas: lineaEstimateGasFee.maxPriorityFeePerGas,
        maxFeePerGas: lineaEstimateGasFee.maxFeePerGas,
        gasLimit: lineaEstimateGasFee.gasLimit,
        nonce: nonce,
      });
    const bridgeTxReceipt = await bridgeResponse.wait();
    console.log(`Bridge tx receipt received=${JSON.stringify(bridgeTxReceipt)}`);

    const sentEventLog = bridgeTxReceipt?.logs.find((log) => log.topics[0] == MESSAGE_SENT_EVENT_SIGNATURE);

    const messageSentEvent = l2MessageService.interface.decodeEventLog(
      "MessageSent",
      sentEventLog!.data,
      sentEventLog!.topics,
    );
    const messageHash = messageSentEvent[messageSentEventMessageHashIndex];

    console.log("Waiting for L1 MessageClaimed event.");

    const [claimedEvent] = await waitForEvents(lineaRollup, lineaRollup.filters.MessageClaimed(messageHash));
    expect(claimedEvent).not.toBeNull();

    console.log(`Message claimed on L1. event=${JSON.stringify(claimedEvent)}`);

    console.log("Verify the token balance on L1");

    const l1TokenBalance = await l1Token.balanceOf(l1Account.address);
    console.log(`Token balance of L1 account is ${l1TokenBalance.toString()}`);

    expect(l1TokenBalance).toEqual(bridgeAmount);
  });
});
