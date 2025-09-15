import { setupTokens, loadTokens, TokenSetup } from "./setup-tokens";
import { ContractTransactionReceipt, ethers, toBeHex } from "ethers";
import { existsSync } from "fs";
import { config } from "./config/tests-config";
import {
  encodeFunctionCall,
  waitForEvents,
  awaitUntil,
  etherToWei,
  getDockerImageTag,
  LineaEstimateGasClient,
  LineaShomeiFrontendClient,
  LineaShomeiClient,
} from "./common/utils";
import { MESSAGE_SENT_EVENT_SIGNATURE, EMPTY_CONTRACT_CODE } from "./common/constants";
import { LineaSDK } from "@consensys/linea-sdk";
//import merkleProofTestData from "../../contracts/test/hardhat/_testData/merkle-proof-data.json";

const messageSentEventMessageNumberIndex = 4;
const messageSentEventMessageHashIndex = 6;
const lineaRollup = config.getLineaRollupContract();
const l2SparseMerkleProofContract = config.getL2SparseMerkleProofContract();
const l2MessageService = config.getL2MessageServiceContract();
const l1Token = config.getL1TokenContract();
const l1Provider = config.getL1Provider();
const l2Provider = config.getL2Provider();
const l1TokenBridge = config.getL1TokenBridgeContract();
const l2TokenBridge = config.getL2TokenBridgeContract();
const l2BesuEndpoint = config.getL2BesuNodeEndpoint();
const shomeiFrontendEndpoint = config.getShomeiFrontendEndpoint();
const shomeiEndpoint = config.getShomeiEndpoint();

async function mintL1Tokens(tokenSetup: TokenSetup, amountValue: string) {
  console.log(`MINT: Minting [${amountValue}] tokens to L1 account`);

  const l1Account = tokenSetup.l1Account;
  const amount = ethers.parseEther(amountValue);

  let l1TokenBalance = await l1Token.balanceOf(l1Account.address);
  console.log(`MINT: Balance of L1 account on L1: ${ethers.formatEther(l1TokenBalance.toString())}`);
  //return;
  console.log(`MINT: Sending [mint] transaction on L1: amount=${amountValue}`);
  const { maxPriorityFeePerGas: l1MaxPriorityFeePerGas, maxFeePerGas: l1MaxFeePerGas } = await l1Provider.getFeeData();
  const nonce = await l1Provider.getTransactionCount(l1Account.address, "pending");
  const tx = await l1Token.connect(l1Account).mint(l1Account.address, amount, {
    nonce: nonce,
    maxPriorityFeePerGas: l1MaxPriorityFeePerGas,
    maxFeePerGas: l1MaxFeePerGas,
  });
  const mintTxReceipt = await tx.wait();
  console.log(`MINT: Confirmed [mint] transaction on L1: receipt=${JSON.stringify(mintTxReceipt)}`);

  l1TokenBalance = await l1Token.balanceOf(l1Account.address);
  console.log(`MINT: Balance of L1 account on L1: ${ethers.formatEther(l1TokenBalance.toString())}`);
  return;
}

async function transferL2(tokenSetup: TokenSetup, amountValue: string) {
  console.log(`L2T: Transfer tokens from L2 account on L2`);

  const lineaEstimateGasClient = new LineaEstimateGasClient(l2BesuEndpoint!);
  const l1Account = tokenSetup.l1Account;
  const l2Account = tokenSetup.l2Account;
  const l2Token = tokenSetup.l2Token;
  const l2TokenAddress = await l2Token.getAddress();
  const amount = ethers.parseEther(amountValue);

  let l2TokenBalance1 = await l2Token.balanceOf(l1Account.address);
  console.log(`L2T: Balance of L1 account on L2: ${ethers.formatEther(l2TokenBalance1.toString())}`);
  let l2TokenBalance2 = await l2Token.balanceOf(l2Account.address);
  console.log(`L2T: Balance of L2 account on L2: ${ethers.formatEther(l2TokenBalance2.toString())}`);

  console.log(`L2T: Sending [transfer] transaction on L2: amount=${amountValue}`);
  const lineaEstimateGasFee = await lineaEstimateGasClient.lineaEstimateGas(
    l2Account.address,
    l2TokenAddress,
    l2Token.interface.encodeFunctionData("transfer", [l1Account.address, amount]),
  );
  const nonce = await l2Provider.getTransactionCount(l2Account.address, "pending");
  const transferTxResponse = await l2Token.connect(l2Account).transfer(l1Account.address, amount, {
    maxPriorityFeePerGas: lineaEstimateGasFee.maxPriorityFeePerGas,
    maxFeePerGas: lineaEstimateGasFee.maxFeePerGas,
    gasLimit: lineaEstimateGasFee.gasLimit,
    nonce: nonce,
  });
  const transferTxReceipt = await transferTxResponse.wait();
  console.log(`L2T: Confirmed [transfer] transaction on L2: receipt=${JSON.stringify(transferTxReceipt)}`);

  l2TokenBalance1 = await l2Token.balanceOf(l1Account.address);
  console.log(`L2T: Balance of L1 account on L2: ${ethers.formatEther(l2TokenBalance1.toString())}`);
  l2TokenBalance2 = await l2Token.balanceOf(l2Account.address);
  console.log(`L2T: Balance of L2 account on L2: ${ethers.formatEther(l2TokenBalance2.toString())}`);
}

async function bridgeL2ToL1(tokenSetup: TokenSetup, amountValue: string) {
  console.log(`L2→L1: Bridge tokens from L2 to L1`);

  const lineaEstimateGasClient = new LineaEstimateGasClient(l2BesuEndpoint!);
  const l1Account = tokenSetup.l1Account;
  const l2Account = tokenSetup.l2Account;
  const l2Token = tokenSetup.l2Token;
  const l2TokenAddress = await l2Token.getAddress();
  const l2TokenBridgeAddress = await l2TokenBridge.getAddress();
  const amount = ethers.parseEther(amountValue);

  console.log(`L2→L1: Sending [approve] transaction to L2`);
  let lineaEstimateGasFee = await lineaEstimateGasClient.lineaEstimateGas(
    l2Account.address,
    l2TokenAddress,
    l2Token.interface.encodeFunctionData("approve", [l2TokenBridgeAddress, amount]),
  );
  let nonce = await l2Provider.getTransactionCount(l2Account.address, "pending");
  const approveResponse = await l2Token.connect(l2Account).approve(l2TokenBridgeAddress, amount, {
    maxPriorityFeePerGas: lineaEstimateGasFee.maxPriorityFeePerGas,
    maxFeePerGas: lineaEstimateGasFee.maxFeePerGas,
    gasLimit: lineaEstimateGasFee.gasLimit,
    nonce: nonce,
  });
  const approveTxReceipt = await approveResponse.wait();
  console.log(`L2→L1: Confirmed [approve] transaction on L2: receipt=${JSON.stringify(approveTxReceipt)}`);

  // Retrieve token allowance
  const allowance = await l2Token.allowance(l2Account.address, l2TokenBridgeAddress);
  console.log(`L2→L1: Allowance on L2 account: ${ethers.formatEther(allowance.toString())}`);
  console.log(`L2→L1: Balance of L2 account: ${ethers.formatEther(await l2Token.balanceOf(l2Account))}`);
  console.log(`L2→L1: Balance of L1 account: ${ethers.formatEther(await l1Token.balanceOf(l1Account))}`);

  console.log(`L2→L1: Sending [bridgeToken] transaction on L2`);
  nonce = await l2Provider.getTransactionCount(l2Account.address, "pending");
  lineaEstimateGasFee = await lineaEstimateGasClient.lineaEstimateGas(
    l2Account.address,
    l2TokenBridgeAddress,
    l2TokenBridge.interface.encodeFunctionData("bridgeToken", [l2TokenAddress, amount, l1Account.address]),
    etherToWei("0.01").toString(16),
  );
  const bridgeResponse = await l2TokenBridge.connect(l2Account).bridgeToken(l2TokenAddress, amount, l1Account.address, {
    value: etherToWei("0.01"),
    maxPriorityFeePerGas: lineaEstimateGasFee.maxPriorityFeePerGas,
    maxFeePerGas: lineaEstimateGasFee.maxFeePerGas,
    gasLimit: lineaEstimateGasFee.gasLimit,
    nonce: nonce,
  });
  const bridgeTxReceipt = await bridgeResponse.wait();
  console.log(`L2→L1: Confirmed [bridgeToken] transaction on L2: receipt=${JSON.stringify(bridgeTxReceipt)}`);

  console.log(`L2→L1: Waiting for event [MessageSent] on L2`);
  const sentEventLog = bridgeTxReceipt?.logs.find((log) => log.topics[0] == MESSAGE_SENT_EVENT_SIGNATURE);
  const messageSentEvent = l2MessageService.interface.decodeEventLog(
    "MessageSent",
    sentEventLog!.data,
    sentEventLog!.topics,
  );
  const messageHash = messageSentEvent[messageSentEventMessageHashIndex];
  console.log(`L2→L1: Confirmed event [MessageSent] on L2: messageHash=${messageHash}`);

  console.log(`L2→L1: Waiting for event [MessageClaimed] on L1`);
  const [claimedEvent] = await waitForEvents(lineaRollup, lineaRollup.filters.MessageClaimed(messageHash));
  console.log(`L2→L1: Confirmed event [MessageClaimed] on L1: event=${JSON.stringify(claimedEvent)}`);

  console.log(`L2→L1: Verifying the token balance on L1`);
  const l1TokenBalance = await l1Token.balanceOf(l1Account.address);
  console.log(`L2→L1: Balance of L1 account: ${ethers.formatEther(l1TokenBalance.toString())}`);
}

async function bridgeL1ToL2(tokenSetup: TokenSetup, amountValue: string) {
  console.log(`L1→L2: Bridge tokens from L1 to L2`);

  const l1Account = tokenSetup.l1Account;
  const l2Account = tokenSetup.l2Account;
  const l2Token = tokenSetup.l2Token;
  const l1TokenBridgeAddress = await l1TokenBridge.getAddress();
  const l1TokenAddress = await l1Token.getAddress();
  const amount = ethers.parseEther(amountValue);

  console.log(`L1→L2: Sending [approve] transaction to L1`);
  const { maxPriorityFeePerGas: l1MaxPriorityFeePerGas, maxFeePerGas: l1MaxFeePerGas } = await l1Provider.getFeeData();
  let nonce = await l1Provider.getTransactionCount(l1Account.address, "pending");
  const approveResponse = await l1Token.connect(l1Account).approve(l1TokenBridgeAddress, amount, {
    nonce: nonce,
    maxPriorityFeePerGas: l1MaxPriorityFeePerGas,
    maxFeePerGas: l1MaxFeePerGas,
  });
  const approveTxReceipt = await approveResponse.wait();
  console.log(`L1→L2: Confirmed [approve] transaction on L1: receipt=${JSON.stringify(approveTxReceipt)}`);

  const allowance = await l1Token.allowance(l1Account.address, l1TokenBridgeAddress);
  console.log(`L1→L2: Allowance on L1 account: ${ethers.formatEther(allowance.toString())}`);
  console.log(`L1→L2: Balance of L1 account: ${ethers.formatEther(await l1Token.balanceOf(l1Account))}`);
  console.log(`L1→L2: Balance of L2 account: ${ethers.formatEther(await l2Token.balanceOf(l2Account))}`);

  console.log(`L1→L2: Sending [bridgeToken] transaction on L1`);
  nonce = await l1Provider.getTransactionCount(l1Account.address, "pending");
  const bridgeTokenTx = await l1TokenBridge.connect(l1Account).bridgeToken(l1TokenAddress, amount, l2Account.address, {
    value: etherToWei("0.01"),
    maxPriorityFeePerGas: l1MaxPriorityFeePerGas,
    maxFeePerGas: l1MaxFeePerGas,
    nonce: nonce,
  });
  const bridgedTxReceipt = await bridgeTokenTx.wait();
  console.log(`L1→L2: Confirmed [bridgeToken] transaction on L1: receipt=${JSON.stringify(bridgedTxReceipt)}`);

  console.log(`L1→L2: Waiting for event [MessageSent] on L1`);
  const messageSentEvent = bridgedTxReceipt?.logs.find((log) => log.topics[0] == MESSAGE_SENT_EVENT_SIGNATURE);
  const messageSentLog = lineaRollup.interface.decodeEventLog(
    "MessageSent",
    messageSentEvent!.data,
    messageSentEvent!.topics,
  );
  const messageNumber = messageSentLog[messageSentEventMessageNumberIndex];
  const messageHash = messageSentLog[messageSentEventMessageHashIndex];
  console.log(`L1→L2: Confirmed event [MessageSent] on L1: messageHash=${messageHash}`);

  console.log(`L1→L2: Waiting for event [RollingHashUpdated] on L2`);
  const [rollingHashUpdatedEvent] = await waitForEvents(
    l2MessageService,
    l2MessageService.filters.RollingHashUpdated(),
    1_000,
    0,
    "latest",
    async (events) => events.filter((event) => event.args.messageNumber >= messageNumber),
  );
  console.log(`L1→L2: Confirmed event [RollingHashUpdated] on L2: event=${JSON.stringify(rollingHashUpdatedEvent)}`);

  console.log(`L1→L2: Checking msg status in L2 inbox: messageHash=${messageHash}`);
  const anchoredStatus = await l2MessageService.inboxL1L2MessageStatus(messageHash);
  console.log(`L1→L2: Confirmed msg status in L2 inbox: status=${anchoredStatus}`);

  console.log(`L1→L2: Waiting for event [MessageClaimed] on L2`);
  const [claimedEvent] = await waitForEvents(l2MessageService, l2MessageService.filters.MessageClaimed(messageHash));
  console.log(`L1→L2: Confirmed event [MessageClaimed] on L2: event=${JSON.stringify(claimedEvent)}`);
  console.log(`L1→L2: Balance of L2 account: ${ethers.formatEther(await l2Token.balanceOf(l2Account))}`);

  return;
}

async function sendL1ToL2(setup: TokenSetup, fee: bigint = 0n, withCalldata: boolean = false) {
  console.log(`L1→L2: Send message from L1 to L2`);
  const l2DummyContract = config.getL2DummyContract(setup.l2Account);
  const lineaRollup = config.getLineaRollupContract(setup.l1Account);

  const calldata = withCalldata
    ? encodeFunctionCall(l2DummyContract.interface, "setPayload", [ethers.randomBytes(100)])
    : "0x";
  const destinationAddress = withCalldata
    ? await l2DummyContract.getAddress()
    : "0x8D97689C9818892B700e27F316cc3E41e17fBeb9";
  const { maxPriorityFeePerGas, maxFeePerGas } = await l1Provider.getFeeData();
  console.log(`L1→L2: Fetched fee data: maxPriorityFeePerGas=${maxPriorityFeePerGas} maxFeePerGas=${maxFeePerGas}`);

  console.log(`L1→L2: Sending [sendMessage] transaction on L1`);
  const tx = await lineaRollup.sendMessage(destinationAddress, fee, calldata, {
    value: fee,
    maxPriorityFeePerGas,
    maxFeePerGas,
  });
  let receipt = await tx.wait();
  while (!receipt) {
    console.log(`Waiting for transaction to be mined: transactionHash=${tx.hash}`);
    receipt = await tx.wait();
  }
  console.log(`L1→L2: Confirmed [sendMessage] transaction on L1: transactionHash=${tx.hash} status=${receipt.status}`);

  return { tx, receipt };
}

async function sendL2ToL1(setup: TokenSetup, fee: bigint = 0n, withCalldata: boolean = false) {
  console.log(`L2→L1: Send message from L2 to L1`);

  const lineaEstimateGasClient = new LineaEstimateGasClient(l2BesuEndpoint!);
  const l1DummyContract = config.getL1DummyContract(setup.l1Account);
  const l2MessageService = config.getL2MessageServiceContract(setup.l2Account);

  const calldata = withCalldata
    ? encodeFunctionCall(l1DummyContract.interface, "setPayload", [ethers.randomBytes(100)])
    : "0x";
  const destinationAddress = withCalldata ? await l1DummyContract.getAddress() : setup.l1Account.address;
  const { maxPriorityFeePerGas, maxFeePerGas, gasLimit } = await lineaEstimateGasClient.lineaEstimateGas(
    setup.l2Account.address,
    await l2MessageService.getAddress(),
    l2MessageService.interface.encodeFunctionData("sendMessage", [destinationAddress, fee, calldata]),
    toBeHex(fee),
  );
  console.log(`L2→L1: Fetched fee data: maxPriorityFeePerGas=${maxPriorityFeePerGas} maxFeePerGas=${maxFeePerGas}`);

  console.log(`L2→L1: Sending [sendMessage] transaction on L2`);
  const tx = await l2MessageService.sendMessage(destinationAddress, fee, calldata, {
    value: fee,
    maxPriorityFeePerGas,
    maxFeePerGas,
    gasLimit,
  });
  let receipt = await tx.wait();
  while (!receipt) {
    console.log(`L2→L1: Waiting for [sendMessage] transaction to be finalized on L2: transactionHash=${tx.hash}`);
    receipt = await tx.wait();
  }
  console.log(`L2→L1: Confirmed [sendMessage] transaction on L2: transactionHash=${tx.hash} status=${receipt.status}`);

  return { tx, receipt };
}

async function getProofForFinalizedBlock() {
  console.log(`GP-L1: Getting proof for finalized block on L1`);
  console.log(`GP-L1: SparseMerkleProof contract on L2: ${await l2SparseMerkleProofContract.getAddress()}`);

  const lineaShomeiFrontenedClient = new LineaShomeiFrontendClient(shomeiFrontendEndpoint!);
  const lineaShomeiClient = new LineaShomeiClient(shomeiEndpoint!);

  const zkStateManagerVersion = await getDockerImageTag("shomei-frontend", "consensys/linea-shomei");
  console.log(`GP-L1: Retrieved docker tag to use as version [zkStateManagerVersion]: ${zkStateManagerVersion}`);

  let targetL2BlockNumber = await awaitUntil(
    async () => {
      try {
        return await lineaRollup.currentL2BlockNumber({ blockTag: "finalized" });
      } catch (err) {
        if (!(err as Error).message.includes("could not decode result data")) {
          throw err;
        } // else means the currentL2BlockNumber is not ready in the L1 rollup contract yet
        return -1n;
      }
    },
    (currentL2BlockNumber: bigint) => currentL2BlockNumber > 1n,
    2000,
    150000,
  );
  if (targetL2BlockNumber && targetL2BlockNumber <= 1n) return;
  console.log(`GP-L1: Retrieved target L2 block number: ${targetL2BlockNumber}`);

  const finalizedL2BlockNumbers = [targetL2BlockNumber!];
  const provingAddress = "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73"; // from genesis file
  const getProofResponse = await awaitUntil(
    async () => {
      let getProofResponse;
      // Need to put all the latest currentL2BlockNumber in a list and traverse to get the proof
      // from one of them as we don't know on which finalized L2 block number the client was being notified
      for (const finalizedL2BlockNumber of finalizedL2BlockNumbers) {
        getProofResponse = await lineaShomeiFrontenedClient.lineaGetProof(
          provingAddress,
          [],
          toBeHex(finalizedL2BlockNumber),
        );
        if (getProofResponse?.result) {
          targetL2BlockNumber = finalizedL2BlockNumber;
          break;
        }
      }
      if (!getProofResponse?.result) {
        const latestFinalizedL2BlockNumber = await lineaRollup.currentL2BlockNumber({ blockTag: "finalized" });
        if (!finalizedL2BlockNumbers.includes(latestFinalizedL2BlockNumber)) {
          finalizedL2BlockNumbers.push(latestFinalizedL2BlockNumber);
          console.log(
            `GP-L1: Finalized L2 block numbers: ${JSON.stringify(finalizedL2BlockNumbers.map((it) => Number(it)))}`,
          );
        }
      }
      return getProofResponse;
    },
    (getProofResponse) => getProofResponse?.result,
    2000,
    150000,
  );
  console.log(`GP-L1: Retrieved proof response: ${JSON.stringify(getProofResponse.result.accountProof)}`);

  const {
    result: { zkEndStateRootHash },
  } = await lineaShomeiClient.rollupGetZkEVMStateMerkleProofV0(
    Number(targetL2BlockNumber),
    Number(targetL2BlockNumber),
    zkStateManagerVersion, // zkStateManagerVersion
  );
  console.log(`GP-L1: Retrieved root hash [zkEndStateRootHash]: ${zkEndStateRootHash}`);

  // const stateRoot = "0x0e080582960965e3c180b1457b16da48041e720af628ae6c1725d13bd98ba9f0";
  // const {
  //   accountProof: {
  //     key,
  //     leafIndex,
  //     proof: { proofRelatedNodes, value },
  //   },
  // } = merkleProofTestData;
  // console.log(proofRelatedNodes, leafIndex, key, value);

  //const isValid = await l2SparseMerkleProofContract.verifyProof(proofRelatedNodes, leafIndex, stateRoot);

  console.log(
    `GP-L1: Retrieved proof data\n`,
    getProofResponse.result.accountProof.proof.proofRelatedNodes,
    getProofResponse.result.accountProof.leafIndex,
    zkEndStateRootHash,
  );
  const isValid = await l2SparseMerkleProofContract.verifyProof(
    getProofResponse.result.accountProof.proof.proofRelatedNodes,
    getProofResponse.result.accountProof.leafIndex,
    zkEndStateRootHash,
  );
  console.log({ isValid });
}

// TODO: L1MessageService:sendMessage - Adds a message for sending cross-chain and emits a relevant event
// TODO: L2MessageService:claimMessage - Claims and delivers a cross-chain message.
async function getProofForL1Message(setup: TokenSetup, receipt: ContractTransactionReceipt) {
  const lineaRollupContract = config.getLineaRollupContract(setup.l1Account);
  const lineaEstimateGasClient = new LineaEstimateGasClient(l2BesuEndpoint!);
  const l2MessageService = config.getL2MessageServiceContract(setup.l2Account);
  //const lineaRollup = config.getLineaRollupContract(setup.l1Account);

  console.log(`L1→L2: Waiting for event [MessageSent] on L1`);
  const [messageSentEvent] = receipt.logs.filter((log) => log.topics[0] === MESSAGE_SENT_EVENT_SIGNATURE);
  const messageSentLog = lineaRollupContract.interface.decodeEventLog(
    "MessageSent",
    messageSentEvent!.data,
    messageSentEvent!.topics,
  );
  //const messageHash = messageSentEvent.topics[3];
  const messageNumber = messageSentLog[messageSentEventMessageNumberIndex];
  const messageHash = messageSentLog[messageSentEventMessageHashIndex];
  console.log(
    `L1→L2: Confirmed event [MessageSent] on L1: event=${JSON.stringify(messageSentEvent)}, messageHash=${messageHash}, messageNumber=${messageNumber}`,
  );

  console.log(`L1→L2: Checking inbox status on L2: messageHash=${messageHash}`);
  let anchoredStatus = await l2MessageService.inboxL1L2MessageStatus(messageHash);
  console.log(`L1→L2: Confirmed inbox status on L2: status=${anchoredStatus}`);

  const rollingHashes = await lineaRollup.rollingHashes(messageNumber);
  console.log(`L1→L2: Checking rolling hashes on L1:`, { rollingHashes });
  console.log(`L1→L2: Checking last anchored message on L2:`, await l2MessageService.lastAnchoredL1MessageNumber());

  console.log(`L1→L2: Waiting for event [RollingHashUpdated] on L2`);
  const [rollingHashUpdatedEvent] = await waitForEvents(
    l2MessageService,
    l2MessageService.filters.RollingHashUpdated(),
    1_000,
    0,
    "latest",
    async (events) => events.filter((event) => event.args.messageNumber >= messageNumber),
  );
  console.log(`L1→L2: Confirmed event [RollingHashUpdated] on L2: event=${JSON.stringify(rollingHashUpdatedEvent)}`);

  const claim = {
    from: messageSentLog[0],
    to: messageSentLog[1],
    fee: messageSentLog[2],
    value: messageSentLog[3],
    messageNumber: messageSentLog[4],
    data: messageSentLog[5],
    feeRecipient: setup.l2Account.address,
  };
  console.log(`L1→L2: Created params to claim on L2:\n`, { claim });

  const { maxPriorityFeePerGas, maxFeePerGas, gasLimit } = await lineaEstimateGasClient.lineaEstimateGas(
    setup.l2Account.address,
    await l2MessageService.getAddress(),
    l2MessageService.interface.encodeFunctionData("claimMessage", [
      claim.from,
      claim.to,
      claim.fee,
      claim.value,
      claim.feeRecipient,
      claim.data,
      claim.messageNumber,
    ]),
    toBeHex(0n), //toBeHex(etherToWei("0.0001")),
  );
  console.log(`L1→L2: Fetched fee data: maxPriorityFeePerGas=${maxPriorityFeePerGas} maxFeePerGas=${maxFeePerGas}`);

  console.log(`L1→L2: Sending [claimMessage] transaction on L2`);
  const claimTx = await l2MessageService.claimMessage(
    claim.from,
    claim.to,
    claim.fee,
    claim.value,
    claim.feeRecipient,
    claim.data,
    claim.messageNumber,
    {
      maxPriorityFeePerGas,
      maxFeePerGas,
      gasLimit,
    },
  );
  const claimReceipt = await claimTx.wait();
  while (!claimReceipt) {
    console.log(`L1→L2: Waiting for [claimMessage] transaction to be finalized on L2: transactionHash=${claimTx.hash}`);
    receipt = await claimTx.wait();
  }
  console.log(
    `L1→L2: Confirmed [claimMessage] transaction on L2: transactionHash=${claimTx.hash} status=${claimReceipt.status}`,
  );

  console.log(`L1→L2: Checking inbox status on L2: messageHash=${messageHash}`);
  anchoredStatus = await l2MessageService.inboxL1L2MessageStatus(messageHash);
  console.log(`L1→L2: Confirmed inbox status on L2: status=${anchoredStatus}`);

  console.log(`L1→L2: Waiting for event [MessageClaimed] on L2`);
  // Wait for event emitted when the L2 message was claimed on L1
  const [claimedEvent] = await waitForEvents(l2MessageService, l2MessageService.filters.MessageClaimed(messageHash));
  console.log(`L1→L2: Confirmed event [MessageClaimed] on L2: event=${JSON.stringify(claimedEvent)}`);
}

// TODO: L2MessageService:sendMessage - Adds a message for sending cross-chain and emits a relevant event.
// TODO: L1MessageService:claimMessageWithProof - Claims and delivers a cross-chain message using a Merkle proof.
// TODO: L1MessageManager:isMessageClaimed - Checks if the L2->L1 message is claimed or not.
async function getProofForL2Message(setup: TokenSetup, receipt: ContractTransactionReceipt) {
  const lineaRollupContract = config.getLineaRollupContract(setup.l1Account);
  const linea = new LineaSDK({
    mode: `read-only`,
    network: `custom`,
    l1RpcUrlOrProvider: setup.l1RpcUrl,
    l2RpcUrlOrProvider: setup.l2RpcUrl,
  });
  const l1MsgServiceContractAddress = await lineaRollup.getAddress();
  const l2MsgServiceContractAddress = await l2MessageService.getAddress();
  const lineaRollupClient = linea.getL1Contract(l1MsgServiceContractAddress, l2MsgServiceContractAddress);

  console.log(`L2→L1: Waiting for event [MessageSent] on L2`);
  const [messageSentEvent] = receipt.logs.filter((log) => log.topics[0] === MESSAGE_SENT_EVENT_SIGNATURE);
  // const messageHash = messageSentLog.topics[3];
  const messageSentLog = l2MessageService.interface.decodeEventLog(
    "MessageSent",
    messageSentEvent!.data,
    messageSentEvent!.topics,
  );
  const messageHash = messageSentLog[messageSentEventMessageHashIndex];
  const messageNumber = messageSentLog[messageSentEventMessageNumberIndex];
  console.log(
    `L2→L1: Confirmed event [MessageSent] on L2: event=${JSON.stringify(messageSentEvent)}, messageHash=${messageHash}, messageNumber=${messageNumber}`,
  );

  console.log(`L2→L1: Waiting for event [L2MessagingBlockAnchored] on L1`);
  // Wait for event emitted when the L2 block contains L2 messages during finalization
  const [anchoredEvent] = await waitForEvents(
    lineaRollup,
    lineaRollup.filters.L2MessagingBlockAnchored(messageSentEvent.blockNumber),
    1_000,
  );
  console.log(`L2→L1: Confirmed event [L2MessagingBlockAnchored] on L1: event=${JSON.stringify(anchoredEvent)}`);

  const messageProof = await lineaRollupClient.getMessageProof(messageHash);
  console.log(`L2→L1: Obtained proof to claim on L1: ${JSON.stringify(messageProof)}`);
  const claim = {
    from: messageSentLog[0],
    to: messageSentLog[1],
    fee: messageSentLog[2],
    value: messageSentLog[3],
    messageNumber: messageSentLog[4],
    data: messageSentLog[5],
    proof: messageProof.proof,
    leafIndex: messageProof.leafIndex,
    merkleRoot: messageProof.root,
    feeRecipient: setup.l1Account.address,
  };
  console.log(`L2→L1: Created params to claim on L1:\n`, { claim });

  //let isMessageClaimed = await lineaRollupContract.isMessageClaimed(claim.messageNumber);
  //console.log(`L2→L1: Checking if message is claimed on L1: ${isMessageClaimed}`);

  console.log(`L2→L1: Sending [claimMessageWithProof] transaction on L1`);
  const { maxPriorityFeePerGas, maxFeePerGas } = await l1Provider.getFeeData();
  const claimTx = await lineaRollupContract.claimMessageWithProof(claim, {
    maxPriorityFeePerGas,
    maxFeePerGas,
  });
  let claimReceipt = await claimTx.wait();
  while (!claimReceipt) {
    console.log(
      `L1→L2: Waiting for [claimMessageWithProof] transaction to be finalized on L1: transactionHash=${claimTx.hash}`,
    );
    claimReceipt = await claimTx.wait();
  }
  console.log(
    `L2→L1: Confirmed [claimMessageWithProof] transaction on L1: transactionHash=${claimTx.hash} status=${claimReceipt.status}`,
  );

  //isMessageClaimed = await lineaRollupContract.isMessageClaimed(claim.messageNumber);
  //console.log(`L2→L1: Checking if message is claimed on L1: ${isMessageClaimed}`);

  console.log(`L2→L1: Waiting for event [MessageClaimed] on L1`);
  // Wait for event emitted when the L2 message was claimed on L1
  const [claimedEvent] = await waitForEvents(lineaRollup, lineaRollup.filters.MessageClaimed(messageHash), 1_000);
  console.log(`L2→L1: Confirmed event [MessageClaimed] on L1: event=${JSON.stringify(claimedEvent)}`);
}

async function checkSetup(filePath: string): Promise<TokenSetup | null> {
  let tokenSetup = null;
  let requireSetup = true;
  if (existsSync(filePath)) {
    tokenSetup = await loadTokens(filePath);
    const l2TokenAddress = await tokenSetup.l2Token.getAddress();
    const l2TokenCode = await l2Provider.getCode(l2TokenAddress);
    if (l2TokenCode !== EMPTY_CONTRACT_CODE) {
      requireSetup = false;
    }
  }
  if (requireSetup) {
    tokenSetup = await setupTokens(filePath);
  }
  return tokenSetup;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests(result: TokenSetup) {
  console.log(
    `SETUP: Balance of L1 account: ${ethers.formatEther(await result.l1Token.balanceOf(result.l1Account.address))}`,
  );
  console.log(
    `SETUP: Balance of L2 account: ${ethers.formatEther(await result.l2Token.balanceOf(result.l2Account.address))}`,
  );
  await mintL1Tokens(result, "100");
  await bridgeL1ToL2(result, "100");
  await transferL2(result, "2");
  await transferL2(result, "3");
  await transferL2(result, "4");
  await bridgeL2ToL1(result, "10");
  await sleep(10000);
  console.log(
    `SETUP: Balance of L1 account: ${ethers.formatEther(await result.l1Token.balanceOf(result.l1Account.address))}`,
  );
  console.log(
    `SETUP: Balance of L2 account: ${ethers.formatEther(await result.l2Token.balanceOf(result.l2Account.address))}`,
  );
}

const runTest = false;
const sendMessages = true;

async function main() {
  try {
    const setup = await checkSetup("./token-setup.json");
    if (!setup) {
      process.exit(0);
    }
    if (runTest) {
      await runTests(setup);
      await getProofForFinalizedBlock();
    }
    if (sendMessages) {
      const msgL2ToL1 = await sendL2ToL1(setup, etherToWei("0.001"), true);
      await getProofForL2Message(setup, msgL2ToL1.receipt);

      const msgL1ToL2 = await sendL1ToL2(setup, etherToWei("1.1"), true);
      await getProofForL1Message(setup, msgL1ToL2.receipt);
    }
  } catch (err) {
    console.error("Encountered an error:", err);
  }
}

main();
