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
    return null;
  }

  inboundCall(
    sourceNetworkId?: bigint,
    encodedInfo?: string,
    encodedProof?: string,
  ): Promise<TransactionResponse> | null {
    console.log(sourceNetworkId, encodedInfo, encodedProof);
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
