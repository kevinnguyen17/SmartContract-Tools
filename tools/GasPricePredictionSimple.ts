import { ethers, BigNumber } from "ethers";

type GasFeeData = {
  maxFeePerGas: BigNumber | null;
  maxPriorityFeePerGas: BigNumber | null;
  gasPrice: BigNumber | null;
};

type GasEstimation = {
  fast: GasFeeData;
  standard: GasFeeData;
  slow: GasFeeData;
};

class NetworkService {
  provider: ethers.providers.JsonRpcProvider;

  slowPercentile = 10;
  standardPercentile = 50;
  fastPercentile = 90;

  constructor(rpc: string) {
    this.provider = new ethers.providers.JsonRpcProvider(rpc);
  }

  async getNextBaseFee() {
    const block = await this.provider.getBlock("latest");
    const gasUsed = BigNumber.from(block.gasUsed);
    const gasLimit = BigNumber.from(block.gasLimit);
    const baseFeePerGas = BigNumber.from(block.baseFeePerGas);

    // Ethereum aims for a target utilization of 50% of the block gas limit.
    const TARGET_GAS_USAGE = gasLimit.div(2);

    // If the block is more than 50% full, increase the base fee; otherwise, decrease it.
    if (gasUsed.gt(TARGET_GAS_USAGE)) {
      return baseFeePerGas.mul(1250).div(1000); // Increase by 12.5%
    } else {
      return baseFeePerGas.mul(1250).div(1000); // Decrease by 12.5%
    }
  }

  analyzeGasPrices(gasPrices: BigNumber[]): BigNumber[] {
    gasPrices.sort((a, b) => a.sub(b).toNumber());

    return [
      gasPrices[Math.floor(gasPrices.length * (this.slowPercentile / 100))],
      gasPrices[Math.floor(gasPrices.length * (this.standardPercentile / 100))],
      gasPrices[Math.floor(gasPrices.length * (this.fastPercentile / 100))]
    ];
  }

  sortBigNumbersDescending(numbers: BigNumber[]): BigNumber[] {
    return numbers.sort((a, b) => {
      if (a.gt(b)) {
        return -1;
      } else if (a.lt(b)) {
        return 1;
      } else {
        return 0;
      }
    });
  }

  async getGasFeeData() {
    const result = await this.provider.send("eth_feeHistory", [
      ethers.utils.hexValue(3), // Number of blocks
      581401, // Sample block to show how value looks like
      [this.slowPercentile, this.standardPercentile, this.fastPercentile] // Percentiles
    ]);

    console.log(result);
    let slow = BigNumber.from(0);
    let standard = BigNumber.from(0);
    let fast = BigNumber.from(0);
    let count = 0;

    if (!result?.reward) {
      console.error(result);
      throw new Error("invalid response");
    }

    for (const item of result.reward) {
      const _slow = BigNumber.from(item[0]);
      const _standard = BigNumber.from(item[1]);
      const _fast = BigNumber.from(item[2]);
      if (_slow.eq(0) || _standard.eq(0) || _fast.eq(0)) {
        continue;
      }
      slow = slow.add(_slow);
      standard = standard.add(_standard);
      fast = fast.add(_fast);
      count++;
    }

    if (count > 0) {
      slow = slow.div(BigNumber.from(count));
      standard = standard.div(BigNumber.from(count));
      fast = fast.div(BigNumber.from(count));
    }

    const block = await this.provider.getBlock("pending");
    const standardGas = BigNumber.from(block.baseFeePerGas);

    const estimatedGas = this.sortBigNumbersDescending([
      standardGas,
      await this.getNextBaseFee(),
      ...this.analyzeGasPrices(result.baseFeePerGas)
    ]);

    return {
      fast: this.normalizeItem({
        maxFeePerGas: estimatedGas[0],
        maxPriorityFeePerGas: fast,
        gasPrice: await this.provider.getGasPrice()
      }),
      standard: this.normalizeItem({
        maxFeePerGas: estimatedGas[1],
        maxPriorityFeePerGas: standard,
        gasPrice: await this.provider.getGasPrice()
      }),
      slow: this.normalizeItem({
        maxFeePerGas: estimatedGas[2],
        maxPriorityFeePerGas: slow,
        gasPrice: await this.provider.getGasPrice()
      })
    };
  }

  private normalizeItem(item: any) {
    return {
      maxFeePerGas: item.maxFeePerGas,
      maxPriorityFeePerGas: item.maxPriorityFeePerGas,
      gasPrice: null
    };
  }
}

export class GasService {
  networkService: NetworkService;
  constructor() {
    this.networkService = new NetworkService(
      "https://rpc.cc3-testnet.creditcoin.network"
    );
  }

  getGasFeeDataForType1And2 = async (): Promise<GasEstimation> => {
    let result;
    try {
      result = await this.networkService.getGasFeeData();
      console.log(result);
    } catch (err) {
      throw err;
    }

    return result;
  };
}
