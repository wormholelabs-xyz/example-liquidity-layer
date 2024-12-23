export * from "./improveOffer";
export * from "./placeInitialOffer";

import { AddressLookupTableAccount, Connection, Keypair, PublicKey } from "@solana/web3.js";
import { PreparedTransaction } from "@wormhole-foundation/example-liquidity-layer-solana";
import { uint64ToBigInt } from "@wormhole-foundation/example-liquidity-layer-solana/common";
import {
    AuctionInfo,
    MatchingEngineProgram,
    MessageProtocol,
} from "@wormhole-foundation/example-liquidity-layer-solana/matchingEngine";
import { toChainId } from "@wormhole-foundation/sdk-base";
import { deserialize } from "@wormhole-foundation/sdk-definitions";
import { utils as coreUtils } from "@wormhole-foundation/sdk-solana-core";
import "dotenv/config";
import * as fs from "node:fs";
import { Logger } from "winston";
import {
    AuctionConfigCache,
    BlockhashCache,
    KnownFastOrder,
    KnownFastOrders,
    Payers,
    SlotCache,
} from "../../src/containers";
import * as utils from "../../src/utils";
import { handleImproveOffer } from "./improveOffer";
import { handlePlaceInitialOffer } from "./placeInitialOffer";

main(process.argv);

async function main(argv: string[]) {
    const cfgJson = JSON.parse(fs.readFileSync(argv[2], "utf-8"));
    const cfg = new utils.AppConfig(cfgJson);

    const logger = cfg.initLogger("solveFastOrder");

    const payers = new Payers();

    // Add payers.
    [
        process.env.SOLANA_PRIVATE_KEY_1,
        process.env.SOLANA_PRIVATE_KEY_2,
        process.env.SOLANA_PRIVATE_KEY_3,
        process.env.SOLANA_PRIVATE_KEY_4,
        process.env.SOLANA_PRIVATE_KEY_5,
    ]
        .filter((k) => k !== undefined)
        .forEach((privateKey) =>
            payers.add(
                Keypair.fromSecretKey(Uint8Array.from(Buffer.from(privateKey, "base64"))),
                logger,
            ),
        );

    if (payers.isEmpty()) {
        throw new Error("No payers found. Need at least SOLANA_PRIVATE_KEY_1 to be defined");
    }

    const connection = cfg.solanaConnection();
    const matchingEngine = cfg.initMatchingEngineProgram();

    const fastVaaSubscriber = cfg.initSubscriber("fastVaa");
    const auctionSubscriber = cfg.initSubscriber("auction");

    const slotCache = await SlotCache.initialize(connection);
    const blockhashCache = await BlockhashCache.initialize(
        connection,
        32, // slots
        "finalized",
        logger,
    );

    const { value: lookupTableAccount } = await connection.getAddressLookupTable(
        cfg.solanaAddressLookupTable(),
    );
    if (lookupTableAccount === null) {
        throw new Error("Address lookup table not found");
    }

    const auctionConfigs = new AuctionConfigCache(matchingEngine);
    const txBatches: TxBatch[] = [];
    const rawFastVaas: Buffer[] = [];
    const knownFastOrders = new KnownFastOrders();
    const auctionExecutionCandidates = new AuctionExecutionCandidates();
    const improvedOfferCounts = new Map<string, number>();
    const cctpAuctionExecutions: AuctionExecutionWithOrder[] = [];
    const localAuctionExecutions: AuctionExecutionWithOrder[] = [];
    const recognizedTokenAccounts = cfg.recognizedAtaAddresses();

    spawnTransactionBatchProcessor(connection, blockhashCache, txBatches, logger);
    spawnPlaceInitialOffer(
        payers,
        cfg,
        matchingEngine,
        auctionConfigs,
        rawFastVaas,
        txBatches,
        knownFastOrders,
        logger,
    );
    spawnExecuteOrderCctp(
        payers,
        cfg,
        matchingEngine,
        cctpAuctionExecutions,
        blockhashCache,
        [lookupTableAccount],
        logger,
    );
    spawnExecuteOrderLocal(
        payers,
        cfg,
        matchingEngine,
        localAuctionExecutions,
        blockhashCache,
        [lookupTableAccount],
        logger,
    );
    spawnAuctionExecutionObserver(
        matchingEngine,
        slotCache,
        knownFastOrders,
        auctionExecutionCandidates,
        cctpAuctionExecutions,
        localAuctionExecutions,
        logger,
    );

    (async function () {
        for await (const [, rawVaa] of fastVaaSubscriber) {
            rawFastVaas.push(rawVaa);
        }
    })();

    for await (const [, msg] of auctionSubscriber) {
        const { auctionData } = utils.readAuction(msg);
        const fastVaaHash = Buffer.from(auctionData.vaaHash);

        logger.debug(
            `Active: ${auctionData.status.active !== undefined}, Completed: ${
                auctionData.status.completed !== undefined
            }`,
        );

        // Auction data will be null if there was no auction. Disregard.
        if (auctionData.status.active === undefined || !knownFastOrders.has(fastVaaHash)) {
            continue;
        }

        const { slot: currentSlot, timestamp: observationTimestamp } = slotCache.current;
        const auctionInfo = auctionData.info!;

        // Fetch the config if we haven't already.
        const auctionConfig = await auctionConfigs.get(auctionInfo.configId);

        // Figure out the end slot.
        const endSlot = uint64ToBigInt(
            auctionInfo.startSlot.addn(auctionConfig.parameters.duration),
        );
        logger.debug(
            `Current slot: ${currentSlot}, slots left for auction: ${endSlot - currentSlot}`,
        );

        const bestOfferToken = auctionInfo.bestOfferToken;

        if (recognizedTokenAccounts.some((key) => key.equals(bestOfferToken))) {
            auctionExecutionCandidates.add(
                endSlot,
                {
                    fastVaaHash,
                    preparedBy: auctionData.preparedBy,
                    auctionInfo,
                },
                auctionData.targetProtocol,
            );
        } else if (knownFastOrders.has(fastVaaHash)) {
            auctionExecutionCandidates.update(fastVaaHash, false);
            logger.info(`Unrecognized token account: ${bestOfferToken.toString()}`);

            // No await, just fire away.
            handleImproveOffer(
                payers,
                cfg,
                matchingEngine,
                improvedOfferCounts,
                {
                    fastVaaHash,
                    info: auctionInfo,
                    config: auctionConfig,
                    currentSlot,
                    endSlot,
                    observationTimestamp,
                },
                logger,
                blockhashCache.latest,
            );
        }
    }
}

// Event loops. Event loops everywhere.

const TIMEOUT_MS = 5;

function spawnTransactionBatchProcessor(
    connection: Connection,
    blockhashCache: BlockhashCache,
    txBatches: TxBatch[],
    logger: Logger,
) {
    setInterval(() => {
        if (txBatches.length > 0) {
            const { txs, retryCount } = txBatches.shift()!;

            // No await, just fire away.
            utils.sendTxBatch(connection, txs, logger, retryCount, blockhashCache.latest);
        }
    }, TIMEOUT_MS);
}

function spawnPlaceInitialOffer(
    payers: Payers,
    cfg: utils.AppConfig,
    matchingEngine: MatchingEngineProgram,
    auctionConfigs: AuctionConfigCache,
    rawFastVaas: Buffer[],
    txBatches: TxBatch[],
    knownFastOrders: KnownFastOrders,
    logger: Logger,
) {
    setInterval(() => {
        if (rawFastVaas.length > 0) {
            const parsed = deserialize("Uint8Array", rawFastVaas.shift()!);
            const fastOrder = utils.tryParseFastMarketOrder(Buffer.from(parsed.payload));

            if (fastOrder !== undefined) {
                const payer = payers.useNext();
                if (payer === undefined) {
                    logger.error("No payers available. Exiting spawnPlaceInitialOffer");
                    return;
                }

                if (cfg.shouldPlaceInitialOffer()) {
                    handlePlaceInitialOffer(
                        cfg,
                        matchingEngine,
                        parsed,
                        fastOrder,
                        payer,
                        logger,
                        auctionConfigs.getLatest(),
                    ).then((txs) => {
                        if (txs !== undefined) {
                            txBatches.push({ txs, retryCount: 0 });
                        }
                    });
                }

                // We may not be successful with placing the initial offer. But we may place an
                // improved offer. So we keep track of the VAA by the fast VAA hash (in
                // Wormhole terms, hash of the message hash).
                knownFastOrders.add(parsed, fastOrder);
            } else {
                logger.warn(`Failed to parse FastMarketOrder, sequence=${parsed.sequence}`);
            }
        }
    }, TIMEOUT_MS);
}

function spawnAuctionExecutionObserver(
    matchingEngine: MatchingEngineProgram,
    slotCache: SlotCache,
    knownFastOrders: KnownFastOrders,
    auctionExecutionCandidates: AuctionExecutionCandidates,
    cctpAuctionExecutions: AuctionExecutionWithOrder[],
    localAuctionExecutions: AuctionExecutionWithOrder[],
    logger: Logger,
) {
    let lastSlot = -1n;

    setInterval(() => {
        const currentSlot = slotCache.current.slot;

        if (currentSlot != lastSlot) {
            if (!auctionExecutionCandidates.isEmpty()) {
                for (const candidate of auctionExecutionCandidates.candidates()) {
                    const { endSlot, auctionExecution, targetProtocol, execute } = candidate;
                    const fastVaaHash = auctionExecution.fastVaaHash;

                    if (execute) {
                        logger.debug(
                            `End slot: ${endSlot}, current slot: ${currentSlot}, isCctp=${
                                targetProtocol.cctp !== undefined
                            }`,
                        );

                        if (currentSlot >= endSlot) {
                            const { parsed, fastOrder } = knownFastOrders.get(fastVaaHash)!;
                            const auctionExecutionWithOrder = {
                                parsed,
                                fastOrder,
                                ...auctionExecution,
                            };

                            if (targetProtocol.cctp !== undefined) {
                                cctpAuctionExecutions.push(auctionExecutionWithOrder);
                            } else if (targetProtocol.local !== undefined) {
                                localAuctionExecutions.push(auctionExecutionWithOrder);
                            } else {
                                const auction = matchingEngine.auctionAddress(fastVaaHash);
                                logger.error(`Unknown target protocol for auction: ${auction}`);
                            }

                            auctionExecutionCandidates.remove(fastVaaHash);
                        }
                    } else {
                        auctionExecutionCandidates.remove(fastVaaHash);
                    }
                }
            }

            lastSlot = currentSlot;
        }
    }, 100);
}

function spawnExecuteOrderCctp(
    payers: Payers,
    cfg: utils.AppConfig,
    matchingEngine: MatchingEngineProgram,
    auctionExecutions: AuctionExecutionWithOrder[],
    blockhashCache: BlockhashCache,
    addressLookupTableAccounts: AddressLookupTableAccount[],
    logger: Logger,
) {
    const connection = matchingEngine.program.provider.connection;
    const coreBridgeProgramId = matchingEngine.coreBridgeProgramId();

    setInterval(() => {
        if (auctionExecutions.length != 0) {
            const { fastVaaHash, preparedBy, auctionInfo, parsed, fastOrder } =
                auctionExecutions.pop()!;

            const payer = payers.useNext();
            if (payer === undefined) {
                logger.error("No payers available. Exiting spawnExecuteOrderCctp");
                return;
            }

            matchingEngine
                .executeFastOrderCctpTx(
                    {
                        payer: payer.publicKey,
                        fastVaa: coreUtils.derivePostedVaaKey(
                            coreBridgeProgramId,
                            Buffer.from(parsed.hash),
                        ),
                        executorToken: cfg.ataAddress(payer.publicKey),
                        auction: matchingEngine.auctionAddress(fastVaaHash),
                        auctionConfig: matchingEngine.auctionConfigAddress(auctionInfo.configId),
                        bestOfferToken: auctionInfo.bestOfferToken,
                        initialOfferToken: auctionInfo.initialOfferToken,
                        initialParticipant: preparedBy,
                    },
                    toChainId(fastOrder.targetChain),
                    [payer],
                    {
                        feeMicroLamports: 10,
                        computeUnits: 290_000,
                        addressLookupTableAccounts,
                    },
                    { skipPreflight: true },
                )
                .then((tx) =>
                    utils.sendTxBatch(
                        connection,
                        [tx],
                        logger,
                        0, // retryCount
                        blockhashCache.latest,
                    ),
                )
                .then((txSigs) => {
                    // Should never happen. But if you send transactions with preflight, you should
                    // change this log message.
                    if (txSigs[0] === null) {
                        logger.error(
                            `Failed to execute CCTP order skipping preflight: ${fastVaaHash.toString(
                                "base64",
                            )}`,
                        );
                    }
                });
        }
    }, TIMEOUT_MS);
}

function spawnExecuteOrderLocal(
    payers: Payers,
    cfg: utils.AppConfig,
    matchingEngine: MatchingEngineProgram,
    auctionExecutions: AuctionExecutionWithOrder[],
    blockhashCache: BlockhashCache,
    addressLookupTableAccounts: AddressLookupTableAccount[],
    logger: Logger,
) {
    const connection = matchingEngine.program.provider.connection;
    const coreBridgeProgramId = matchingEngine.coreBridgeProgramId();

    setInterval(async () => {
        if (auctionExecutions.length != 0) {
            const { fastVaaHash, preparedBy, auctionInfo, parsed, fastOrder } =
                auctionExecutions.pop()!;

            // First check if the reserved fast fill sequence has already been
            // created.
            const alreadyReserved = await matchingEngine
                .fetchReservedFastFillSequence(fastVaaHash)
                .then((_) => true)
                .catch((_) => false);

            if (alreadyReserved) {
                logger.debug(
                    `Fast fill sequence already reserved: ${fastVaaHash.toString("base64")}`,
                );
            } else {
                const payer = payers.useNext();
                if (payer === undefined) {
                    logger.error("No payers available. Exiting spawnExecuteOrderLocal");
                    return;
                }

                // Reserve fast fill sequence.
                await matchingEngine
                    .reserveFastFillSequenceActiveAuctionTx(
                        {
                            payer: payer.publicKey,
                            fastVaa: coreUtils.derivePostedVaaKey(
                                coreBridgeProgramId,
                                Buffer.from(parsed.hash),
                            ),
                            auctionConfig: matchingEngine.auctionConfigAddress(
                                auctionInfo.configId,
                            ),
                        },
                        {
                            fastVaaHash,
                            sourceChain: toChainId(parsed.emitterChain),
                            orderSender: Array.from(fastOrder.sender.toUint8Array()),
                            targetChain: toChainId(fastOrder.targetChain),
                        },
                        [payer],
                        {
                            computeUnits: 70000,
                            feeMicroLamports: 10,
                        },
                        {
                            commitment: "confirmed",
                        },
                    )
                    .then((tx) =>
                        utils.sendTxBatch(
                            connection,
                            [tx],
                            logger,
                            5, // retryCount
                            blockhashCache.latest,
                        ),
                    )
                    .then((txSigs) => {
                        if (txSigs[0] === null) {
                            logger.error(
                                `Failed to reserve fast fill sequence: ${fastVaaHash.toString(
                                    "base64",
                                )}`,
                            );
                        }
                    })
                    .then(() =>
                        matchingEngine.executeFastOrderLocalTx(
                            {
                                payer: payer.publicKey,
                                fastVaa: coreUtils.derivePostedVaaKey(
                                    coreBridgeProgramId,
                                    Buffer.from(parsed.hash),
                                ),
                                reservedSequence:
                                    matchingEngine.reservedFastFillSequenceAddress(fastVaaHash),
                                executorToken: cfg.ataAddress(payer.publicKey),
                                auction: matchingEngine.auctionAddress(fastVaaHash),
                                auctionConfig: matchingEngine.auctionConfigAddress(
                                    auctionInfo.configId,
                                ),
                                bestOfferToken: auctionInfo.bestOfferToken,
                                initialOfferToken: auctionInfo.initialOfferToken,
                                initialParticipant: preparedBy,
                            },
                            [payer],
                            {
                                feeMicroLamports: 10,
                                computeUnits: 290_000,
                                addressLookupTableAccounts,
                            },
                            { skipPreflight: true },
                        ),
                    )
                    .then((tx) =>
                        utils.sendTxBatch(
                            connection,
                            [tx],
                            logger,
                            0, // retryCount
                            blockhashCache.latest,
                        ),
                    )
                    .then((txSigs) => {
                        // Should never happen. But if you send transactions with preflight, you should
                        // change this log message.
                        if (txSigs[0] === null) {
                            logger.error(
                                `Failed to execute local order skipping preflight: ${fastVaaHash.toString(
                                    "base64",
                                )}`,
                            );
                        }
                    });
            }
        }
    }, TIMEOUT_MS);
}

type AuctionExecution = {
    fastVaaHash: Buffer;
    preparedBy: PublicKey;
    auctionInfo: AuctionInfo;
};

type AuctionExecutionWithOrder = AuctionExecution & KnownFastOrder;

type TxBatch = { txs: PreparedTransaction[]; retryCount: number };

class AuctionExecutionCandidates {
    private _candidates: Map<
        string,
        {
            endSlot: bigint;
            auctionExecution: AuctionExecution;
            targetProtocol: MessageProtocol;
            execute: boolean;
        }
    >;

    constructor() {
        this._candidates = new Map();
    }

    add(endSlot: bigint, auctionExecution: AuctionExecution, targetProtocol: MessageProtocol) {
        const key = auctionExecution.fastVaaHash.toString("base64");
        const candidates = this._candidates;
        if (candidates.has(key)) {
            candidates.get(key)!.execute = true;
        } else {
            candidates.set(key, {
                endSlot,
                auctionExecution,
                targetProtocol,
                execute: true,
            });
        }
    }

    update(fastVaaHash: Buffer, execute: boolean): boolean {
        const key = fastVaaHash.toString("base64");
        const found = this._candidates.has(key);
        if (found) {
            this._candidates.get(key)!.execute = execute;
        }
        return found;
    }

    remove(fastVaaHash: Buffer): boolean {
        return this._candidates.delete(fastVaaHash.toString("base64"));
    }

    isEmpty(): boolean {
        return this._candidates.size == 0;
    }

    candidates(): Array<{
        endSlot: bigint;
        auctionExecution: AuctionExecution;
        targetProtocol: MessageProtocol;
        execute: boolean;
    }> {
        return Array.from(this._candidates.values());
    }
}

class ExampleSolver {
    cfg: utils.AppConfig;
    payers: Payers;

    constructor(cfg: utils.AppConfig, payers: Payers) {
        this.cfg = cfg;
        this.payers = payers;
    }

    async initialize() {
        // TODO
    }

    async enableCctpOrderPipeline() {
        // TODO
    }

    async enableLocalOrderPipeline() {
        // TODO
    }
}
