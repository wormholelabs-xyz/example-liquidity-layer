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
import { Logger } from "winston";
import * as zmq from "zeromq";
import { Publisher } from ".";
import { defaultLogger } from "../utils/logger";

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

export const ZMQ_CHANNEL_NAMES = ["fastVaa", "finalizedVaa"] as const;
export type ZmqChannelName = (typeof ZMQ_CHANNEL_NAMES)[number];

export type SolanaConnectionConfig = {
    rpc: string;
    maxTransactionsPerSecond: number;
    commitment: Commitment;
    addressLookupTable: PublicKey;
    matchingEngine: ProgramId;
    mint: PublicKey;
    knownAtaOwners: PublicKey[];
};

export type VaaSpyConfig = {
    host: string;
    enableObservationCleanup: boolean;
    observationSeenThresholdMs: number;
    observationCleanupIntervalMs: number;
    observationsToRemovePerInterval: number;
    delayedThresholdMs: number;
};

export type PricingParameters = {
    rollbackRisk: number;
    offerEdge: number;
};

export type RouterEndpointsConfig = {
    chain: Chain;
    endpoint: string;
} & PricingParameters;

export type EnvironmentConfig = {
    environment: Environment;
    zmqChannels: {
        fastVaa: string;
        finalizedVaa: string;
    };
    publisher: {
        log: LogConfig;
        vaaSpy: VaaSpyConfig;
    };
    solver: {
        log: LogConfig;
        connection: SolanaConnectionConfig;
    };
    routerEndpoints: RouterEndpointsConfig[];
};

export class Config {
    private _cfg: EnvironmentConfig;

    constructor(input: any) {
        this._cfg = validateEnvironmentConfig(input);
    }

    initLogger(app: "publisher" | "solver"): Logger {
        const filename = this._cfg[app].log.filename;
        const level = this._cfg[app].log.level;

        const logger = defaultLogger({
            label: app,
            level,
            filename,
        });

        if (filename === undefined) {
            console.log(`Start logging with ${level} level.`);
        } else {
            console.log(`Start logging with ${level} level to file: ${filename}`);
        }
        logger.info(`Environment: ${this._cfg.environment}`);

        return logger;
    }

    maxTransactionsPerSecond(): number {
        return this._cfg.solver.connection.maxTransactionsPerSecond;
    }

    addressLookupTable(): PublicKey {
        return new PublicKey(this._cfg.solver.connection.addressLookupTable);
    }

    initMatchingEngineProgram(debug?: boolean): MatchingEngineProgram {
        return new MatchingEngineProgram(
            this._initConnection(debug),
            this._cfg.solver.connection.matchingEngine,
            this._cfg.solver.connection.mint,
        );
    }

    initPublisher(channelName: ZmqChannelName): Publisher {
        return new Publisher(channelName, this._cfg.zmqChannels[channelName]);
    }

    initSubscriber(channelName: ZmqChannelName, topic?: Buffer): zmq.Subscriber {
        const channel = this._cfg.zmqChannels[channelName];
        const sock = new zmq.Subscriber();
        sock.connect(channel);
        sock.subscribe(topic ?? Buffer.alloc(0));

        return sock;
    }

    knownAtaOwners(): PublicKey[] {
        return Array.from(this._cfg.solver.connection.knownAtaOwners);
    }

    recognizedAtaAddresses(): PublicKey[] {
        return this.knownAtaOwners().map((key) => this.ataAddress(key));
    }

    ataAddress(owner: PublicKey): PublicKey {
        return splToken.getAssociatedTokenAddressSync(this._cfg.solver.connection.mint, owner);
    }

    pricingParameters(chain: number): PricingParameters | null {
        const endpoint = this._cfg.routerEndpoints.find((p) => toChainId(p.chain) == chain);
        if (endpoint === undefined) {
            return null;
        }

        const { rollbackRisk, offerEdge } = endpoint;
        return { rollbackRisk, offerEdge };
    }

    cctpEndpoint(): string {
        return this._cfg.environment == Environment.MAINNET
            ? CCTP_ATTESTATION_ENDPOINT_MAINNET
            : CCTP_ATTESTATION_ENDPOINT_TESTNET;
    }

    wormscanEndpoint(): string {
        return this._cfg.environment == Environment.MAINNET
            ? WORMHOLESCAN_VAA_ENDPOINT_MAINNET
            : WORMHOLESCAN_VAA_ENDPOINT_TESTNET;
    }

    initVaaSpy(): VaaSpy {
        const vaaFilters = this._cfg.routerEndpoints.map((cfg) => ({
            chain: cfg.chain,
            nativeAddress: cfg.endpoint,
        }));

        const vaaSpy = this._cfg.publisher.vaaSpy;

        return new VaaSpy({
            spyHost: vaaSpy.host,
            enableCleanup: vaaSpy.enableObservationCleanup,
            seenThresholdMs: vaaSpy.observationSeenThresholdMs,
            intervalMs: vaaSpy.observationCleanupIntervalMs,
            maxToRemove: vaaSpy.observationsToRemovePerInterval,
            vaaFilters,
        });
    }

    vaaDelayedThreshold(): number {
        return this._cfg.publisher.vaaSpy.delayedThresholdMs;
    }

    private _initConnection(debug?: boolean): Connection {
        if (debug === undefined) {
            return new Connection(this._cfg.solver.connection.rpc, {
                commitment: this._cfg.solver.connection.commitment,
            });
        }

        const fetchLogger = defaultLogger({ label: "fetch", level: debug ? "debug" : "error" });
        fetchLogger.debug("Start logging Solana connection fetches");

        return new Connection(this._cfg.solver.connection.rpc, {
            commitment: this._cfg.solver.connection.commitment,
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
}

function validateEnvironmentConfig(cfg: any): EnvironmentConfig {
    // check root keys
    for (const key of Object.keys(cfg)) {
        if (
            key !== "environment" &&
            key !== "zmqChannels" &&
            key !== "publisher" &&
            key !== "solver" &&
            key !== "routerEndpoints"
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
            if (typeof cfg.zmqChannels[key] !== "string") {
                throw new Error(`zmqChannels.${key} must be a string`);
            }
        }
    }

    // publisher
    if (cfg.publisher === undefined) {
        throw new Error("publisher is required");
    } else {
        const requiredKeys = ["log", "vaaSpy"];

        for (const key of Object.keys(cfg.publisher)) {
            if (!requiredKeys.includes(key)) {
                throw new Error(`unexpected key: publisher.${key}`);
            }
        }

        for (const key of requiredKeys) {
            if (cfg.publisher[key] === undefined) {
                throw new Error(`publisher.${key} is required`);
            }
        }

        // log
        if (cfg.publisher.log === undefined) {
            throw new Error("log is required");
        } else {
            const requiredKeys = ["level"];

            for (const key of Object.keys(cfg.publisher.log)) {
                if (key === "filename") {
                    continue;
                } else if (!requiredKeys.includes(key)) {
                    throw new Error(`unexpected key: publisher.log.${key}`);
                }
            }

            for (const key of requiredKeys) {
                if (cfg.publisher.log[key] === undefined) {
                    throw new Error(`publisher.log.${key} is required`);
                }
            }

            if (typeof cfg.publisher.log.level !== "string") {
                throw new Error("publisher.log.level must be a string");
            }
            if (
                cfg.publisher.log.filename !== undefined &&
                typeof cfg.publisher.log.filename !== "string"
            ) {
                throw new Error("publisher.log.filename must be a string if specified");
            }
        }

        // vaaSpy
        if (cfg.publisher.vaaSpy === undefined) {
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

            for (const key of Object.keys(cfg.publisher.vaaSpy)) {
                if (!requiredKeys.includes(key)) {
                    throw new Error(`unexpected key: publisher.vaaSpy.${key}`);
                }
            }

            for (const key of requiredKeys) {
                if (cfg.publisher.vaaSpy[key] === undefined) {
                    throw new Error(`publisher.vaaSpy.${key} is required`);
                }
            }

            if (typeof cfg.publisher.vaaSpy.host != "string") {
                throw new Error("publisher.vaaSpy.host must be a string");
            }
            if (typeof cfg.publisher.vaaSpy.enableObservationCleanup != "boolean") {
                throw new Error("publisher.vaaSpy.enableObservationCleanup must be a boolean");
            }
            if (typeof cfg.publisher.vaaSpy.observationSeenThresholdMs != "number") {
                throw new Error("publisher.vaaSpy.observationSeenThresholdMs must be a number");
            }
            if (typeof cfg.publisher.vaaSpy.observationCleanupIntervalMs != "number") {
                throw new Error("publisher.vaaSpy.observationCleanupIntervalMs must be a number");
            }
            if (typeof cfg.publisher.vaaSpy.observationsToRemovePerInterval != "number") {
                throw new Error(
                    "publisher.vaaSpy.observationsToRemovePerInterval must be a number",
                );
            }
        }
    }

    // solver
    if (cfg.solver === undefined) {
        throw new Error("solver is required");
    } else {
        const requiredKeys = ["log", "connection"];

        for (const key of Object.keys(cfg.solver)) {
            if (!requiredKeys.includes(key)) {
                throw new Error(`unexpected key: solver.${key}`);
            }
        }

        for (const key of requiredKeys) {
            if (cfg.solver[key] === undefined) {
                throw new Error(`solver.${key} is required`);
            }
        }

        // log
        {
            const requiredKeys = ["level"];

            for (const key of Object.keys(cfg.solver.log)) {
                if (key === "filename") {
                    continue;
                } else if (!requiredKeys.includes(key)) {
                    throw new Error(`unexpected key: solver.log.${key}`);
                }
            }

            for (const key of requiredKeys) {
                if (cfg.solver.log[key] === undefined) {
                    throw new Error(`solver.log.${key} is required`);
                }
            }

            if (typeof cfg.solver.log.level !== "string") {
                throw new Error("solver.log.level must be a string");
            }
            if (
                cfg.solver.log.filename !== undefined &&
                typeof cfg.solver.log.filename !== "string"
            ) {
                throw new Error("solver.log.filename must be a string if specified");
            }
        }

        // connection
        {
            const requiredKeys = [
                "rpc",
                "maxTransactionsPerSecond",
                "commitment",
                "addressLookupTable",
                "matchingEngine",
                "mint",
                "knownAtaOwners",
            ];

            for (const key of Object.keys(cfg.solver.connection)) {
                if (!requiredKeys.includes(key)) {
                    throw new Error(`unexpected key: solver.connection.${key}`);
                }
            }

            for (const key of requiredKeys) {
                if (cfg.solver.connection[key] === undefined) {
                    throw new Error(`solver.connection.${key} is required`);
                }
            }

            if (typeof cfg.solver.connection.rpc !== "string") {
                throw new Error("solver.connection.rpc must be a string");
            }
            if (typeof cfg.solver.connection.maxTransactionsPerSecond !== "number") {
                throw new Error("solver.connection.maxTransactionsPerSecond must be a number");
            }
            if (!isValidCommitment(cfg.solver.connection.commitment)) {
                throw new Error(
                    "solver.connection.commitment must be either processed, confirmed, or finalized",
                );
            }
            try {
                cfg.solver.connection.addressLookupTable = new PublicKey(
                    cfg.solver.connection.addressLookupTable,
                );
            } catch (_) {
                throw new Error(`solver.connection.addressLookupTable must be a valid PublicKey`);
            }
            if (!PROGRAM_IDS.includes(cfg.solver.connection.matchingEngine)) {
                throw new Error("solver.connection.matchingEngine must be a valid ProgramId");
            }
            try {
                cfg.solver.connection.mint = new PublicKey(cfg.solver.connection.mint);
            } catch (_) {
                throw new Error(`solver.connection.mint must be a valid PublicKey`);
            }
            // knownAtaOwners
            {
                if (!Array.isArray(cfg.solver.connection.knownAtaOwners)) {
                    throw new Error("knownAtaOwners must be an array");
                }

                // Make sure the ATA owners list is nonzero.
                if (cfg.solver.connection.knownAtaOwners.length === 0) {
                    throw new Error("knownAtaOwners must be a non-empty array");
                }

                for (let i = 0; i < cfg.solver.connection.knownAtaOwners.length; ++i) {
                    try {
                        cfg.solver.connection.knownAtaOwners[i] = new PublicKey(
                            cfg.solver.connection.knownAtaOwners[i],
                        );
                    } catch (_) {
                        throw new Error(
                            `knownAtaOwner ${i}: ${cfg.solver.connection.knownAtaOwners[i]} must be a valid PublicKey`,
                        );
                    }
                }
            }
        }
    }

    // routerEndpoints
    if (cfg.routerEndpoints === undefined) {
        throw new Error("routerEndpoints is required");
    } else {
        if (!Array.isArray(cfg.routerEndpoints)) {
            throw new Error("routerEndpoints must be an array");
        }
        if (cfg.routerEndpoints.length === 0) {
            throw new Error("routerEndpoints must contain at least one element");
        }
        for (const { chain, endpoint, rollbackRisk, offerEdge } of cfg.routerEndpoints) {
            if (chain === undefined) {
                throw new Error("routerEndpoints.chain is required");
            }
            if (!isChain(chain)) {
                throw new Error(`invalid chain: ${chain}`);
            }
            if (endpoint === undefined) {
                throw new Error("routerEndpoints.endpoint is required");
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

            if (rollbackRisk === undefined) {
                throw new Error("pricingParameter.rollbackRisk is required");
            } else if (typeof rollbackRisk !== "number") {
                throw new Error("pricingParameter.rollbackRisk must be a number");
            } else if (rollbackRisk <= 0 || rollbackRisk > 1) {
                throw new Error("pricingParameter.rollbackRisk must be in (0, 1]");
            }

            if (offerEdge === undefined) {
                throw new Error("pricingParameter.offerEdge is required");
            } else if (typeof offerEdge !== "number") {
                throw new Error("pricingParameter.offerEdge must be a number");
            } else if (offerEdge < 0) {
                throw new Error("pricingParameter.offerEdge must be non-negative");
            }
        }
    }

    return {
        environment: cfg.environment,
        zmqChannels: {
            fastVaa: cfg.zmqChannels.fastVaa,
            finalizedVaa: cfg.zmqChannels.finalizedVaa,
        },
        publisher: {
            log: {
                level: cfg.publisher.log.level,
                filename: cfg.publisher.log.filename,
            },
            vaaSpy: {
                host: cfg.publisher.vaaSpy.host,
                enableObservationCleanup: cfg.publisher.vaaSpy.enableObservationCleanup,
                observationSeenThresholdMs: cfg.publisher.vaaSpy.observationSeenThresholdMs,
                observationCleanupIntervalMs: cfg.publisher.vaaSpy.observationCleanupIntervalMs,
                observationsToRemovePerInterval:
                    cfg.publisher.vaaSpy.observationsToRemovePerInterval,
                delayedThresholdMs: cfg.publisher.vaaSpy.delayedThresholdMs,
            },
        },
        solver: {
            log: {
                level: cfg.solver.log.level,
                filename: cfg.solver.log.filename,
            },
            connection: {
                rpc: cfg.solver.connection.rpc,
                maxTransactionsPerSecond: cfg.solver.connection.maxTransactionsPerSecond,
                commitment: cfg.solver.connection.commitment,
                addressLookupTable: cfg.solver.connection.addressLookupTable,
                matchingEngine: cfg.solver.connection.matchingEngine,
                mint: cfg.solver.connection.mint,
                knownAtaOwners: cfg.solver.connection.knownAtaOwners,
            },
        },
        routerEndpoints: cfg.routerEndpoints,
    };
}

function isValidCommitment(value: string): boolean {
    return value === "processed" || value === "confirmed" || value === "finalized";
}
