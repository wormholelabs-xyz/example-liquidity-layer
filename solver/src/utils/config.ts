// required for `toNative` to register the addresses
import "@wormhole-foundation/sdk-evm/address";
import "@wormhole-foundation/sdk-solana/address";

import * as splToken from "@solana/spl-token";
import { Commitment, Connection, FetchFn, PublicKey } from "@solana/web3.js";
import {
    MatchingEngineProgram,
    PROGRAM_IDS,
    ProgramId,
} from "@wormhole-foundation/example-liquidity-layer-solana/matchingEngine";
import { VaaSpy } from "@wormhole-foundation/example-liquidity-layer-solana/wormhole";
import {
    Chain,
    chainToPlatform,
    chains,
    contracts,
    isChain,
    toChainId,
} from "@wormhole-foundation/sdk-base";
import { VAA } from "@wormhole-foundation/sdk-definitions";
import { ethers } from "ethers";
import mongoose from "mongoose";
import { Logger } from "winston";
import * as zmq from "zeromq";
import { Publisher } from "../containers";
import { defaultLogger } from "./logger";

export const EVM_FAST_CONSISTENCY_LEVEL = 200;

export const CCTP_ATTESTATION_ENDPOINT_TESTNET = "https://iris-api-sandbox.circle.com";
export const CCTP_ATTESTATION_ENDPOINT_MAINNET = "https://iris-api.circle.com";
export const WORMHOLESCAN_VAA_ENDPOINT_TESTNET = "https://api.testnet.wormholescan.io/api/v1/vaas/";
export const WORMHOLESCAN_VAA_ENDPOINT_MAINNET = "https://api.wormholescan.io/api/v1/vaas/";

enum Environment {
    MAINNET = "Mainnet",
    TESTNET = "Testnet",
    DEVNET = "Devnet",
}

export type LogConfig = {
    level: string;
    filename?: string;
};

export type ZmqChannelParameters = {
    channel: string;
    publish: boolean;
};

export const ZMQ_CHANNEL_NAMES = ["fastVaa", "finalizedVaa", "postedVaa", "auction"] as const;
export type ZmqChannelName = (typeof ZMQ_CHANNEL_NAMES)[number];

export type ZmqChannels = {
    fastVaa: ZmqChannelParameters;
    finalizedVaa: ZmqChannelParameters;
    postedVaa: ZmqChannelParameters;
    auction: ZmqChannelParameters;
};

export type SolanaConnectionConfig = {
    rpc: string;
    commitment: Commitment;
    addressLookupTable: PublicKey;
    matchingEngine: ProgramId;
    mint: PublicKey;
    onAccountChange: OnAccountChangeConfig;
    sourceTxHash: SourceTxHashConfig;
    knownAtaOwners: PublicKey[];
    computeUnits: ComputeUnitsConfig;
    shouldPlaceInitialOffer: boolean;
};

export type OnAccountChangeConfig = {
    postedVaaCommitment: Commitment;
    auctionCommitment: Commitment;
};

export type SourceTxHashConfig = {
    maxRetries: number;
    retryBackoff: number;
};

export type ComputeUnitsConfig = {
    verifySignatures: number;
    postVaa: number;
    settleAuctionNoneCctp: number;
    settleAuctionNoneLocal: number;
    settleAuctionComplete: number;
    initiateAuction: number;
};

export type VaaSpyConfig = {
    host: string;
    enableObservationCleanup: boolean;
    observationSeenThresholdMs: number;
    observationCleanupIntervalMs: number;
    observationsToRemovePerInterval: number;
    delayedThresholdMs: number;
};

export type InputEndpointChainConfig = {
    chain: Chain;
    chainType: ChainType;
    rpc: string;
    endpoint: string;
};

export type PricingParameters = {
    chain: Chain;
    probability: number;
    edgePctOfFv: number;
};

export type EnvironmentConfig = {
    environment: Environment;
    log: LogConfig;
    zmqChannels: ZmqChannels;
    mongoDatabase: string;
    solanaConnection: SolanaConnectionConfig;
    vaaSpy: VaaSpyConfig;
    pricing: PricingParameters[];
    endpointConfig: InputEndpointChainConfig[];
};

export type ChainConfig = InputEndpointChainConfig & {
    fastConsistencyLevel?: number;
};

export enum ChainType {
    Evm,
    Solana,
}

export class AppConfig {
    private _cfg: EnvironmentConfig;

    private _chainCfgs: Partial<{ [k: number]: ChainConfig }>;

    private _wormholeAddresses: {
        [k in Chain]?: { core?: string; token_bridge?: string; nft_bridge?: string };
    };

    constructor(input: any) {
        this._cfg = validateEnvironmentConfig(input);

        this._chainCfgs = this._cfg.endpointConfig
            .map((cfg) => ({
                ...cfg,
                fastConsistencyLevel:
                    chainToPlatform(cfg.chain) === "Evm" ? EVM_FAST_CONSISTENCY_LEVEL : undefined,
            }))
            .reduce((acc, cfg) => ({ ...acc, [toChainId(cfg.chain)]: cfg }), {});

        this._wormholeAddresses = Object.fromEntries(
            chains.map((chain) => {
                return [
                    chain,
                    {
                        core: contracts.coreBridge.get(this._cfg.environment, chain),
                        token_bridge: contracts.tokenBridge.get(this._cfg.environment, chain),
                        nft_bridge: contracts.nftBridge.get(this._cfg.environment, chain),
                    },
                ];
            }) as [Chain, { core?: string; token_bridge?: string; nft_bridge?: string }][],
        );
    }

    initLogger(label?: string): Logger {
        const filename = this._cfg.log.filename;

        const logger = defaultLogger({
            label: label ?? "app",
            level: this._cfg.log.level,
            filename,
        });

        if (filename === undefined) {
            console.log("Start logging");
        } else {
            console.log(`Start logging to file: ${filename}`);
        }
        logger.info(`Environment: ${this._cfg.environment}`);

        return logger;
    }

    sourceTxHash(): { maxRetries: number; retryBackoff: number } {
        return this._cfg.solanaConnection.sourceTxHash;
    }

    solanaConnection(debug?: boolean): Connection {
        if (debug === undefined) {
            return new Connection(this._cfg.solanaConnection.rpc, {
                commitment: this._cfg.solanaConnection.commitment,
            });
        }

        const fetchLogger = defaultLogger({ label: "fetch", level: debug ? "debug" : "error" });
        fetchLogger.debug("Start debug logging Solana connection fetches.");

        return new Connection(this._cfg.solanaConnection.rpc, {
            commitment: this._cfg.solanaConnection.commitment,
            fetchMiddleware: function (
                info: Parameters<FetchFn>[0],
                init: Parameters<FetchFn>[1],
                fetch: (...a: Parameters<FetchFn>) => void,
            ) {
                if (init !== undefined) {
                    // @ts-ignore: init is not null
                    fetchLogger.debug(init.body!);
                }
                return fetch(info, init);
            },
        });
    }

    solanaCommitment(): Commitment {
        return this._cfg.solanaConnection.commitment;
    }

    solanaAddressLookupTable(): PublicKey {
        return new PublicKey(this._cfg.solanaConnection.addressLookupTable);
    }

    connectMongoDb(): Promise<typeof mongoose> {
        return mongoose.connect(this._cfg.mongoDatabase);
    }

    initMatchingEngineProgram(): MatchingEngineProgram {
        return new MatchingEngineProgram(
            this.solanaConnection(),
            this._cfg.solanaConnection.matchingEngine,
            this._cfg.solanaConnection.mint,
        );
    }

    initPublisher(channelName: ZmqChannelName): Publisher {
        const params = this._cfg.zmqChannels[channelName];
        return new Publisher(channelName, params.publish ? params.channel : undefined);
    }

    initSubscriber(channelName: ZmqChannelName, topic?: Buffer): zmq.Subscriber {
        const params = this._cfg.zmqChannels[channelName];
        const sock = new zmq.Subscriber();
        sock.connect(params.channel);
        sock.subscribe(topic ?? Buffer.alloc(0));

        return sock;
    }

    verifySignaturesComputeUnits(): number {
        return this._cfg.solanaConnection.computeUnits.verifySignatures;
    }

    postVaaComputeUnits(): number {
        return this._cfg.solanaConnection.computeUnits.postVaa;
    }

    settleAuctionNoneCctpComputeUnits(): number {
        return this._cfg.solanaConnection.computeUnits.settleAuctionNoneCctp;
    }

    settleAuctionNoneLocalComputeUnits(): number {
        return this._cfg.solanaConnection.computeUnits.settleAuctionNoneLocal;
    }

    settleAuctionCompleteComputeUnits(): number {
        return this._cfg.solanaConnection.computeUnits.settleAuctionComplete;
    }

    initiateAuctionComputeUnits(): number {
        return this._cfg.solanaConnection.computeUnits.initiateAuction;
    }

    knownAtaOwners(): PublicKey[] {
        return this._cfg.solanaConnection.knownAtaOwners;
    }

    recognizedAtaAddresses(): PublicKey[] {
        return this.knownAtaOwners().map((key) => this.ataAddress(key));
    }

    ataAddress(owner: PublicKey): PublicKey {
        return splToken.getAssociatedTokenAddressSync(this._cfg.solanaConnection.mint, owner);
    }

    pricingParameters(chain: number): PricingParameters | null {
        const pricing = this._cfg.pricing.find((p) => toChainId(p.chain) == chain);

        return pricing === undefined ? null : pricing;
    }

    unsafeChainCfg(chain: number): { coreBridgeAddress: string } & ChainConfig {
        const chainCfg = this._chainCfgs[chain]!;
        return {
            coreBridgeAddress: this._wormholeAddresses![chainCfg.chain]!.core!,
            ...chainCfg,
        };
    }

    cctpAttestationEndpoint(): string {
        return this._cfg.environment == Environment.MAINNET
            ? CCTP_ATTESTATION_ENDPOINT_MAINNET
            : CCTP_ATTESTATION_ENDPOINT_TESTNET;
    }

    wormholeScanVaaEndpoint(): string {
        return this._cfg.environment == Environment.MAINNET
            ? WORMHOLESCAN_VAA_ENDPOINT_MAINNET
            : WORMHOLESCAN_VAA_ENDPOINT_TESTNET;
    }

    spyEmitterFilter(): { chain: Chain; nativeAddress: string }[] {
        return this._cfg.endpointConfig.map((cfg) => ({
            chain: cfg.chain,
            nativeAddress: cfg.endpoint,
        }));
    }

    initVaaSpy(): VaaSpy {
        return new VaaSpy({
            spyHost: this._cfg.vaaSpy.host,
            enableCleanup: this._cfg.vaaSpy.enableObservationCleanup,
            seenThresholdMs: this._cfg.vaaSpy.observationSeenThresholdMs,
            intervalMs: this._cfg.vaaSpy.observationCleanupIntervalMs,
            maxToRemove: this._cfg.vaaSpy.observationsToRemovePerInterval,
            vaaFilters: this.spyEmitterFilter(),
        });
    }

    vaaDelayedThreshold(): number {
        return this._cfg.vaaSpy.delayedThresholdMs;
    }

    isFastFinality(vaa: VAA): boolean {
        return (
            vaa.consistencyLevel ==
            this._chainCfgs[toChainId(vaa.emitterChain)]?.fastConsistencyLevel
        );
    }

    shouldPlaceInitialOffer(): boolean {
        return this._cfg.solanaConnection.shouldPlaceInitialOffer;
    }
}

function validateEnvironmentConfig(cfg: any): EnvironmentConfig {
    // check root keys
    for (const key of Object.keys(cfg)) {
        if (
            key !== "environment" &&
            key !== "log" &&
            key !== "zmqChannels" &&
            key !== "mongoDatabase" &&
            key !== "solanaConnection" &&
            key !== "vaaSpy" &&
            key !== "endpointConfig" &&
            key !== "pricing"
        ) {
            throw new Error(`unexpected key: ${key}`);
        }
    }

    // environment
    if (cfg.environment !== Environment.MAINNET && cfg.environment !== Environment.TESTNET) {
        throw new Error(
            `environment must be either ${Environment.MAINNET} or ${Environment.TESTNET}`,
        );
    }

    // log
    if (cfg.log === undefined) {
        throw new Error("log is required");
    } else {
        const requiredKeys = ["level"];

        for (const key of Object.keys(cfg.log)) {
            if (key === "filename") {
                continue;
            } else if (!requiredKeys.includes(key)) {
                throw new Error(`unexpected key: log.${key}`);
            }
        }

        for (const key of requiredKeys) {
            if (cfg.log[key] === undefined) {
                throw new Error(`log.${key} is required`);
            }
        }

        if (typeof cfg.log.level !== "string") {
            throw new Error("log.level must be a string");
        }
        if (cfg.log.filename !== undefined && typeof cfg.log.filename !== "string") {
            throw new Error("log.filename must be a string if specified");
        }
    }

    // zmqChannels
    if (cfg.zmqChannels === undefined) {
        throw new Error("zmqChannels is required");
    } else {
        const requiredKeys: string[] = [...ZMQ_CHANNEL_NAMES];

        for (const key of Object.keys(cfg.zmqChannels)) {
            if (!requiredKeys.includes(key)) {
                throw new Error(`unexpected key: zmqChannels.${key}`);
            }
        }

        for (const key of requiredKeys) {
            if (cfg.zmqChannels[key] === undefined) {
                throw new Error(`zmqChannels.${key} is required`);
            }
        }

        for (const key of requiredKeys) {
            if (typeof cfg.zmqChannels[key].channel !== "string") {
                throw new Error(`zmqChannels.${key}.channel must be a string`);
            }
            if (typeof cfg.zmqChannels[key].publish !== "boolean") {
                throw new Error(`zmqChannels.${key}.publish must be a boolean`);
            }
        }
    }

    // mongoDatabase
    if (cfg.mongoDatabase === undefined) {
        throw new Error("mongoDatabase is required");
    } else if (typeof cfg.mongoDatabase !== "string") {
        throw new Error("mongoDatabase must be a string");
    }

    // solanaConnection
    if (cfg.solanaConnection === undefined) {
        throw new Error("connection is required");
    } else {
        const requiredKeys = [
            "rpc",
            "commitment",
            "addressLookupTable",
            "matchingEngine",
            "mint",
            "onAccountChange",
            "sourceTxHash",
            "knownAtaOwners",
            "computeUnits",
            "shouldPlaceInitialOffer",
        ];

        for (const key of Object.keys(cfg.solanaConnection)) {
            if (!requiredKeys.includes(key)) {
                throw new Error(`unexpected key: solanaConnection.${key}`);
            }
        }

        for (const key of requiredKeys) {
            if (cfg.solanaConnection[key] === undefined) {
                throw new Error(`solanaConnection.${key} is required`);
            }
        }

        if (typeof cfg.solanaConnection.rpc !== "string") {
            throw new Error("solanaConnection.rpc must be a string");
        }
        if (!isValidCommitment(cfg.solanaConnection.commitment)) {
            throw new Error(
                "solanaConnection.commitment must be either processed, confirmed, or finalized",
            );
        }
        try {
            cfg.solanaConnection.addressLookupTable = new PublicKey(
                cfg.solanaConnection.addressLookupTable,
            );
        } catch (_) {
            throw new Error(`solanaConnection.addressLookupTable must be a valid PublicKey`);
        }
        if (!PROGRAM_IDS.includes(cfg.solanaConnection.matchingEngine)) {
            throw new Error("solanaConnection.matchingEngine must be a valid ProgramId");
        }
        try {
            cfg.solanaConnection.mint = new PublicKey(cfg.solanaConnection.mint);
        } catch (_) {
            throw new Error(`solanaConnection.mint must be a valid PublicKey`);
        }
        // onAccountChange
        {
            const requiredKeys = ["postedVaaCommitment", "auctionCommitment"];

            for (const key of Object.keys(cfg.solanaConnection.onAccountChange)) {
                if (!requiredKeys.includes(key)) {
                    throw new Error(`unexpected key: solanaConnection.onAccountChange.${key}`);
                }
            }

            for (const key of requiredKeys) {
                if (cfg.solanaConnection.onAccountChange[key] === undefined) {
                    throw new Error(`solanaConnection.onAccountChange.${key} is required`);
                } else if (!isValidCommitment(cfg.solanaConnection.onAccountChange[key])) {
                    throw new Error(
                        `solanaConnection.onAccountChange.${key} must be either processed, confirmed, or finalized`,
                    );
                }
            }
        }
        // sourceTxHash
        {
            const requiredKeys = ["maxRetries", "retryBackoff"];

            for (const key of Object.keys(cfg.solanaConnection.sourceTxHash)) {
                if (!requiredKeys.includes(key)) {
                    throw new Error(`unexpected key: solanaConnection.sourceTxHash.${key}`);
                }
            }

            for (const key of requiredKeys) {
                if (cfg.solanaConnection.sourceTxHash[key] === undefined) {
                    throw new Error(`solanaConnection.sourceTxHash.${key} is required`);
                }
            }

            if (typeof cfg.solanaConnection.sourceTxHash.maxRetries !== "number") {
                throw new Error("solanaConnection.sourceTxHash.maxRetries must be a number");
            }
            if (typeof cfg.solanaConnection.sourceTxHash.retryBackoff !== "number") {
                throw new Error("solanaConnection.sourceTxHash.retryBackoff must be a number");
            }
        }
        // knownAtaOwners
        {
            if (!Array.isArray(cfg.solanaConnection.knownAtaOwners)) {
                throw new Error("knownAtaOwners must be an array");
            }

            // Make sure the ATA owners list is nonzero.
            if (cfg.solanaConnection.knownAtaOwners.length === 0) {
                throw new Error("knownAtaOwners must be a non-empty array");
            }

            for (let i = 0; i < cfg.solanaConnection.knownAtaOwners.length; ++i) {
                try {
                    cfg.solanaConnection.knownAtaOwners[i] = new PublicKey(
                        cfg.solanaConnection.knownAtaOwners[i],
                    );
                } catch (_) {
                    throw new Error(
                        `knownAtaOwner ${i}: ${cfg.solanaConnection.knownAtaOwners[i]} must be a valid PublicKey`,
                    );
                }
            }
        }
        // computeUnits
        {
            const requiredKeys = [
                "verifySignatures",
                "postVaa",
                "settleAuctionNoneCctp",
                "settleAuctionNoneLocal",
                "settleAuctionComplete",
                "initiateAuction",
            ];

            for (const key of Object.keys(cfg.solanaConnection.computeUnits)) {
                if (!requiredKeys.includes(key)) {
                    throw new Error(`unexpected key: computeUnits.${key}`);
                }
            }

            for (const key of requiredKeys) {
                if (cfg.solanaConnection.computeUnits[key] === undefined) {
                    throw new Error(`computeUnits.${key} is required`);
                } else if (typeof cfg.solanaConnection.computeUnits[key] !== "number") {
                    throw new Error(`computeUnits.${key} must be a number`);
                }
            }
        }
        // shouldPlaceInitialOffer
        if (typeof cfg.solanaConnection.shouldPlaceInitialOffer !== "boolean") {
            throw new Error("solanaConnection.shouldPlaceInitialOffer must be a boolean");
        }
    }

    // vaaSpy
    if (cfg.vaaSpy === undefined) {
        throw new Error("vaaSpy is required");
    } else {
        const requiredKeys = [
            "host",
            "enableObservationCleanup",
            "observationSeenThresholdMs",
            "observationCleanupIntervalMs",
            "observationsToRemovePerInterval",
            "delayedThresholdMs",
        ];

        for (const key of Object.keys(cfg.vaaSpy)) {
            if (!requiredKeys.includes(key)) {
                throw new Error(`unexpected key: vaaSpy.${key}`);
            }
        }

        for (const key of requiredKeys) {
            if (cfg.vaaSpy[key] === undefined) {
                throw new Error(`vaaSpy.${key} is required`);
            }
        }

        if (typeof cfg.vaaSpy.host != "string") {
            throw new Error("vaaSpy.host must be a string");
        }
        if (typeof cfg.vaaSpy.enableObservationCleanup != "boolean") {
            throw new Error("vaaSpy.enableObservationCleanup must be a boolean");
        }
        if (typeof cfg.vaaSpy.observationSeenThresholdMs != "number") {
            throw new Error("vaaSpy.observationSeenThresholdMs must be a number");
        }
        if (typeof cfg.vaaSpy.observationCleanupIntervalMs != "number") {
            throw new Error("vaaSpy.observationCleanupIntervalMs must be a number");
        }
        if (typeof cfg.vaaSpy.observationsToRemovePerInterval != "number") {
            throw new Error("vaaSpy.observationsToRemovePerInterval must be a number");
        }
    }

    // Pricing
    if (!Array.isArray(cfg.pricing)) {
        throw new Error("pricing must be an array");
    }

    for (const { chain, probability, edgePctOfFv } of cfg.pricing) {
        if (chain === undefined) {
            throw new Error("pricingParameter.chain is required");
        } else if (!isChain(chain)) {
            throw new Error(`invalid chain: ${chain}`);
        }

        if (probability === undefined) {
            throw new Error("pricingParameter.probability is required");
        } else if (typeof probability !== "number") {
            throw new Error("pricingParameter.probability must be a number");
        } else if (probability <= 0 || probability > 1) {
            throw new Error("pricingParameter.probability must be in (0, 1]");
        }

        if (edgePctOfFv === undefined) {
            throw new Error("pricingParameter.edgePctOfFv is required");
        } else if (typeof edgePctOfFv !== "number") {
            throw new Error("pricingParameter.edgePctOfFv must be a number");
        } else if (edgePctOfFv < 0) {
            throw new Error("pricingParameter.edgePctOfFv must be non-negative");
        }
    }

    // endpointConfig
    if (cfg.endpointConfig === undefined) {
        throw new Error("endpointConfig is required");
    } else {
        if (!Array.isArray(cfg.endpointConfig)) {
            throw new Error("endpointConfig must be an array");
        }
        if (cfg.endpointConfig.length === 0) {
            throw new Error("endpointConfig must contain at least one element");
        }
        for (const { chain, rpc, endpoint, chainType } of cfg.endpointConfig) {
            if (chain === undefined) {
                throw new Error("endpointConfig.chain is required");
            }
            if (!isChain(chain)) {
                throw new Error(`invalid chain: ${chain}`);
            }
            if (chainType === undefined) {
                throw new Error("endpointConfig.chainType is required");
            }
            if (chainType !== ChainType.Evm && chainType !== ChainType.Solana) {
                throw new Error("endpointConfig.chainType must be either Evm or Solana");
            }
            if (rpc === undefined) {
                throw new Error("endpointConfig.rpc is required");
            }
            if (endpoint === undefined) {
                throw new Error("endpointConfig.endpoint is required");
            }
            // Address should be checksummed.
            try {
                if (endpoint != ethers.utils.getAddress(endpoint)) {
                    throw new Error(
                        `chain=${chain} address must be check-summed: ${ethers.utils.getAddress(
                            endpoint,
                        )}`,
                    );
                }
            } catch (_) {
                throw new Error(`chain=${chain} address must be a valid EVM address`);
            }
        }
    }

    return {
        environment: cfg.environment,
        log: {
            level: cfg.log.level,
            filename: cfg.log.filename,
        },
        zmqChannels: {
            fastVaa: cfg.zmqChannels.fastVaa,
            finalizedVaa: cfg.zmqChannels.finalizedVaa,
            postedVaa: cfg.zmqChannels.postedVaa,
            auction: cfg.zmqChannels.auction,
        },
        mongoDatabase: cfg.mongoDatabase,
        solanaConnection: {
            rpc: cfg.solanaConnection.rpc,
            commitment: cfg.solanaConnection.commitment,
            addressLookupTable: cfg.solanaConnection.addressLookupTable,
            matchingEngine: cfg.solanaConnection.matchingEngine,
            mint: cfg.solanaConnection.mint,
            onAccountChange: {
                postedVaaCommitment: cfg.solanaConnection.onAccountChange.postedVaaCommitment,
                auctionCommitment: cfg.solanaConnection.onAccountChange.auctionCommitment,
            },
            sourceTxHash: {
                maxRetries: cfg.solanaConnection.sourceTxHash.maxRetries,
                retryBackoff: cfg.solanaConnection.sourceTxHash.retryBackoff,
            },
            knownAtaOwners: cfg.solanaConnection.knownAtaOwners,
            computeUnits: {
                verifySignatures: cfg.solanaConnection.computeUnits.verifySignatures,
                postVaa: cfg.solanaConnection.computeUnits.postVaa,
                settleAuctionNoneCctp: cfg.solanaConnection.computeUnits.settleAuctionNoneCctp,
                settleAuctionNoneLocal: cfg.solanaConnection.computeUnits.settleAuctionNoneLocal,
                settleAuctionComplete: cfg.solanaConnection.computeUnits.settleAuctionComplete,
                initiateAuction: cfg.solanaConnection.computeUnits.initiateAuction,
            },
            shouldPlaceInitialOffer: cfg.solanaConnection.shouldPlaceInitialOffer,
        },
        vaaSpy: {
            host: cfg.vaaSpy.host,
            enableObservationCleanup: cfg.vaaSpy.enableObservationCleanup,
            observationSeenThresholdMs: cfg.vaaSpy.observationSeenThresholdMs,
            observationCleanupIntervalMs: cfg.vaaSpy.observationCleanupIntervalMs,
            observationsToRemovePerInterval: cfg.vaaSpy.observationsToRemovePerInterval,
            delayedThresholdMs: cfg.vaaSpy.delayedThresholdMs,
        },
        pricing: cfg.pricing,
        endpointConfig: cfg.endpointConfig,
    };
}

function isValidCommitment(value: string): boolean {
    return value === "processed" || value === "confirmed" || value === "finalized";
}
