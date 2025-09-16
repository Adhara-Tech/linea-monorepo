import { Provider, TransactionResponse } from "ethers";

interface IInteropManager {
  outboundCall(
    targetNetworkId?: bigint,
    targetAddress?: string,
    functionCallData?: string,
  ): Promise<TransactionResponse> | null;
  inboundCall(
    sourceNetworkId?: bigint,
    encodedInfo?: string,
    encodedProof?: string,
  ): Promise<TransactionResponse> | null;
}

export default class InteropManager implements IInteropManager {
  protected readonly chainId: number;
  protected provider: Provider;

  constructor(provider: Provider, chainId: number) {
    this.provider = provider;
    this.chainId = chainId;
  }

  outboundCall(
    targetNetworkId?: bigint,
    targetContractAddress?: string,
    functionCallData?: string,
  ): Promise<TransactionResponse> | null {
    console.log(targetNetworkId, targetContractAddress, functionCallData);
    console.log(`Emits an event currently\n`);

    console.log(`Makes use of a connector contract, for the target network, to 
                 make a crosschain call\n`);

    console.log(`Sending to a L2 Linea network requires a call to 
                 L1MessageService:sendMessage(targetContractAddress,fee,functionCallData).`);
    console.log(`Embedded in the rollup contract on L1.`);
    console.log(`Maintains a map [rollingHashes] that is used when messages are anchored 
                 on L2 by a trusted coordinator.\n`);

    console.log(`Sending to a L1 Linea anchor network requires a call to  
                 L2MessageService:sendMessage(targetContractAddress,fee,functionCallData)`);
    console.log(`Separate contract on L2.`);
    console.log(`Increment [nextMessageNumber], handle fees and emits a [MessageSent] event`);

    // The L1 rollup contract can stay as it is and the [L2LineaConnector] crosschain connector contract provides
    // the function [_addRollingHash] that updates the connector contract storage map [rollingHashes].
    // The L2 contract can inherit from the [L1LineaConnector] crosschain connector contract where
    // the [MessageSent] event is emitted and the connector contract storage counter [nextMessageNumber] increased.
    return null;
  }

  inboundCall(
    sourceNetworkId?: bigint,
    encodedInfo?: string,
    encodedProof?: string,
  ): Promise<TransactionResponse> | null {
    console.log(sourceNetworkId, encodedInfo, encodedProof);
    console.log(`Makes use of a connector contract, for the source network, to 
                 extract the verified destination contract address and function call data\n`);

    console.log(`Receiving from a L2 Linea network requires a call to  
                 L1MessageService:claimMessageWithProof(). This will execute the call.`);
    console.log(`Embedded in the rollup contract on L1. Executes the message.`);
    console.log(`Verification requires access to a map [l2MerkleRootsDepths].`);
    console.log(`The map [l2MerkleRootsDepths] is updated by an external function [finalizeBlocks] invoked to 
                 finalize compressed blocks, with a proof, in the rollup contract.\n`);

    console.log(`Receiving from a L1 Linea anchor network requires a call to  
                 L2MessageService:claimMessage(). This will execute the call.`);
    console.log(`Separate contract on L2. Executes the message.`);
    console.log(`Verification requires access to a map [inboxL1L2MessageStatus].`);
    console.log(`The map [inboxL1L2MessageStatus] is updated by an external function [anchorL1L2MessageHashes] invoked 
                 by a trusted party to anchor L1 [rollingHashes] on L2.`);

    // The L1 rollup contract can be modified to call the [L2LineaConnector] crosschain connector contract where
    // the function [_addL2MerkleRoots] updates the connector contract storage map [l2MerkleRootsDepths].
    // The L2 contract can inherit from the [L1LineaConnector] crosschain connector contract where
    // the function [anchorL1L2MessageHashes] updates the connector contract storage map [inboxL1L2MessageStatus].
    return null;
  }

  // private async retry<T>(fn: () => Promise<T>, retries: number, delayMs: number): Promise<T> {
  //   let attempt = 0;
  //
  //   while (attempt < retries) {
  //     try {
  //       return await fn();
  //     } catch (error) {
  //       attempt++;
  //       if (attempt >= retries) {
  //         this.logger.error(`IM: Operation failed after attempts=${attempt} error=${(error as Error).message}`);
  //         throw error;
  //       }
  //       this.logger.warn(`IM: Attempt ${attempt} failed. Retrying in ${delayMs}ms: error=${(error as Error).message}`);
  //       await this.delay(delayMs);
  //     }
  //   }
  //   throw new Error("IM: Unexpected error in retry mechanism.");
  // }

  // private delay(ms: number): Promise<void> {
  //   return new Promise((resolve) => setTimeout(resolve, ms));
  // }
}

export { InteropManager };
