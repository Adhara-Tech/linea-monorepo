import { ethers, Wallet, JsonRpcProvider } from "ethers";
import { config } from "./config/tests-config";
import { waitForEvents, etherToWei } from "./common/utils";
import { MESSAGE_SENT_EVENT_SIGNATURE } from "./common/constants";
import {
  BridgedToken,
  BridgedToken__factory,
  TestERC20,
  TestERC20__factory,
  TokenBridgeV1_1 as TokenBridge,
  TokenBridgeV1_1__factory as TokenBridge__factory,
} from "./typechain";
import fs from "fs/promises";

export class TokenSetup {
  constructor(
    public l1RpcUrl: string,
    public l1Token: TestERC20,
    public l1Bridge: TokenBridge,
    public l1Account: Wallet,
    public l2RpcUrl: string,
    public l2Token: BridgedToken,
    public l2Bridge: TokenBridge,
    public l2Account: Wallet,
  ) {}

  toJSON() {
    return {
      l1Token: { target: this.l1Token.target },
      l1Bridge: { target: this.l1Bridge.target },
      l1Account: { address: this.l1Account.address, privateKey: this.l1Account.privateKey },
      l1RpcUrl: this.l1RpcUrl,
      l2Token: { target: this.l2Token.target },
      l2Bridge: { target: this.l2Bridge.target },
      l2Account: { address: this.l2Account.address, privateKey: this.l2Account.privateKey },
      l2RpcUrl: this.l2RpcUrl,
    };
  }

  async saveToFile(filePath: string) {
    const jsonData = JSON.stringify(this.toJSON(), null, 2);
    await fs.writeFile(filePath, jsonData, "utf-8");
  }

  static async loadFromFile(filePath: string): Promise<TokenSetup> {
    const fileData = await fs.readFile(filePath, "utf-8");
    const obj = JSON.parse(fileData);

    const l1Provider = new JsonRpcProvider(obj.l1RpcUrl.toString());
    const l2Provider = new JsonRpcProvider(obj.l2RpcUrl.toString());

    const l1Acc = new Wallet(obj.l1Account.privateKey, l1Provider);
    const l2Acc = new Wallet(obj.l2Account.privateKey, l2Provider);

    const l1Tok: TestERC20 = TestERC20__factory.connect(obj.l1Token.target, l1Provider);
    const l1Bdg: TokenBridge = TokenBridge__factory.connect(obj.l1Bridge.target, l1Provider);
    const l2Tok: BridgedToken = BridgedToken__factory.connect(obj.l2Token.target, l2Provider);
    const l2Bdg: TokenBridge = TokenBridge__factory.connect(obj.l2Bridge.target, l2Provider);

    return new TokenSetup("http://localhost:8445", l1Tok, l1Bdg, l1Acc, "http://localhost:8545", l2Tok, l2Bdg, l2Acc);
  }
}

export async function loadTokens(filePath: string): Promise<TokenSetup> {
  console.log("SETUP: Loading token contract setup from file [token-setup.json]");
  return TokenSetup.loadFromFile(filePath);
}

export async function setupTokens(filePath: string): Promise<TokenSetup> {
  const l1AccountManager = config.getL1AccountManager();
  const l2AccountManager = config.getL2AccountManager();
  const mintAmount = ethers.parseEther("100000");
  const bridgeAmount = ethers.parseEther("110");
  const messageSentEventMessageNumberIndex = 4;
  const messageSentEventMessageHashIndex = 6;

  const lineaRollup = config.getLineaRollupContract();
  const l2MessageService = config.getL2MessageServiceContract();
  const l1TokenBridge = config.getL1TokenBridgeContract();
  const l2TokenBridge = config.getL2TokenBridgeContract();
  const l1Token = config.getL1TokenContract();
  const l1Provider = config.getL1Provider();
  //const l2Provider = config.getL2Provider();

  console.log(`SETUP: Setting up token contracts`);

  const [l1Account, l2Account] = await Promise.all([
    l1AccountManager.generateAccount(),
    l2AccountManager.generateAccount(),
  ]);

  console.log(`SETUP: Minting ERC20 tokens to L1 account [${l1Account.address}] and approving tokens for L1 bridge`);

  let l1Fees = await l1Provider.getFeeData();
  let nonce = await l1Provider.getTransactionCount(l1Account.address, "pending");
  await Promise.all([
    (
      await l1Token.connect(l1Account).mint(l1Account.address, mintAmount, {
        nonce: nonce,
        maxPriorityFeePerGas: l1Fees.maxPriorityFeePerGas,
        maxFeePerGas: l1Fees.maxFeePerGas,
      })
    ).wait(),
    (
      await l1Token.connect(l1Account).approve(l1TokenBridge.getAddress(), bridgeAmount, {
        maxPriorityFeePerGas: l1Fees.maxPriorityFeePerGas,
        maxFeePerGas: l1Fees.maxFeePerGas,
        nonce: nonce + 1,
      })
    ).wait(),
  ]);

  const l1TokenBridgeAddress = await l1TokenBridge.getAddress();
  const l1TokenAddress = await l1Token.getAddress();
  const allowance = await l1Token.allowance(l1Account.address, l1TokenBridgeAddress);
  console.log(`SETUP: Allowance on L1 account: ${ethers.formatEther(allowance.toString())}`);

  console.log(`SETUP: Bridge tokens from L1 to L2`);
  l1Fees = await l1Provider.getFeeData();
  nonce = await l1Provider.getTransactionCount(l1Account.address, "pending");
  const bridgeTokenTx = await l1TokenBridge
    .connect(l1Account)
    .bridgeToken(l1TokenAddress, bridgeAmount, l2Account.address, {
      value: etherToWei("0.01"),
      maxPriorityFeePerGas: l1Fees.maxPriorityFeePerGas,
      maxFeePerGas: l1Fees.maxFeePerGas,
      nonce: nonce,
    });
  const bridgedTxReceipt = await bridgeTokenTx.wait();

  console.log(`SETUP: Waiting for event [MessageSent] on L1`);
  const sentEventLog = bridgedTxReceipt?.logs.find((log) => log.topics[0] == MESSAGE_SENT_EVENT_SIGNATURE);
  const messageSentEvent = lineaRollup.interface.decodeEventLog(
    "MessageSent",
    sentEventLog!.data,
    sentEventLog!.topics,
  );

  const l1TokenBalance = await l1Token.balanceOf(l1Account.address);
  console.log(`SETUP: Balance of L1 account: ${ethers.formatEther(l1TokenBalance.toString())}`);

  const messageNumber = messageSentEvent[messageSentEventMessageNumberIndex];
  const messageHash = messageSentEvent[messageSentEventMessageHashIndex];
  console.log(`SETUP: Confirmed event [MessageSent] on L1: messageHash=${messageHash}`);

  console.log(`SETUP: Waiting for event [RollingHashUpdated] on L2`);
  const [rollingHashUpdatedEvent] = await waitForEvents(
    l2MessageService,
    l2MessageService.filters.RollingHashUpdated(),
    1_000,
    0,
    "latest",
    async (events) => events.filter((event) => event.args.messageNumber >= messageNumber),
  );
  console.log(`SETUP: Confirmed event [RollingHashUpdated] on L2: event=${JSON.stringify(rollingHashUpdatedEvent)}`);

  console.log(`SETUP: Checking msg status in L2 inbox: messageHash=${messageHash}`);
  const anchoredStatus = await l2MessageService.inboxL1L2MessageStatus(messageHash);
  console.log(`SETUP: Confirmed msg status in L2 inbox: status=${anchoredStatus}`);

  console.log(`SETUP: Waiting for event [MessageClaimed] on L2`);
  const [claimedEvent] = await waitForEvents(l2MessageService, l2MessageService.filters.MessageClaimed(messageHash));
  const [newTokenDeployed] = await waitForEvents(l2TokenBridge, l2TokenBridge.filters.NewTokenDeployed());
  console.log(`SETUP: Confirmed event [MessageClaimed] on L2: event=${JSON.stringify(claimedEvent)}`);

  const l2Token = config.getL2BridgedTokenContract(newTokenDeployed.args.bridgedToken);
  console.log(`SETUP: Setup deployed new token on L2: ${l2Token.target}`);

  //const l2TokenBalance = await l2Token.balanceOf(l2Account.address);
  //console.log(`SETUP: Balance of L2 account: ${ethers.formatEther(l2TokenBalance.toString())}`);

  const setup = new TokenSetup(
    "http://localhost:8445",
    l1Token,
    l1TokenBridge,
    l1Account,
    "http://localhost:8545",
    l2Token,
    l2TokenBridge,
    l2Account,
  );
  await setup.saveToFile(filePath);
  return setup;
}
