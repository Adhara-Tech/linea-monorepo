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
    console.log(`Emits an event currently`);
    console.log(`Sending to a L2 Linea network requires a call to  
                 L1MessageService:sendMessage(targetContractAddress,fee,functionCallData)`);
    console.log(`Sending to a L1 Anchor network requires a call to  
                 L2MessageService:sendMessage(targetContractAddress,fee,functionCallData)`);
    return null;
  }

  inboundCall(
    sourceNetworkId?: bigint,
    encodedInfo?: string,
    encodedProof?: string,
  ): Promise<TransactionResponse> | null {
    console.log(sourceNetworkId, encodedInfo, encodedProof);
    console.log(`Makes use of a verifying connector contract for the source network to 
                 extract the verified destination contract address and function call data`);
    console.log(`Receiving from a L2 Linea network requires a call to  
                 L1MessageService:claimMessageWithProof()`);
    console.log(`Receiving from a L1 Anchor network requires a call to  
                 L2MessageService:claimMessage()`);

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
