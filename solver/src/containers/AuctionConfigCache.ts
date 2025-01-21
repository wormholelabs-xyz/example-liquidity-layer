import {
    AuctionConfig,
    MatchingEngineProgram,
} from "@wormhole-foundation/example-liquidity-layer-solana/matchingEngine";

export class AuctionConfigCache {
    _matchingEngine: MatchingEngineProgram;
    _configs: Map<number, AuctionConfig>;

    constructor(matchingEngine: MatchingEngineProgram) {
        this._matchingEngine = matchingEngine;
        this._configs = new Map();
    }

    async get(configId: number): Promise<AuctionConfig> {
        const configs = this._configs;

        if (!configs.has(configId)) {
            const auctionConfig = await this._matchingEngine.fetchAuctionConfig(configId);
            configs.set(configId, auctionConfig);
        }

        return configs.get(configId)!;
    }

    // NOTE: This returns -1 if there are no configs yet.
    getLatest(): AuctionConfig | undefined {
        const configs = this._configs;

        const configId = Array.from(configs.keys()).reduce(
            (maxConfigId, configId) => Math.max(maxConfigId, configId),
            -1,
        );

        return configs.get(configId);
    }
}
