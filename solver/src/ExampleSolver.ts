import * as splToken from "@solana/spl-token";
import { AddressLookupTableAccount, Connection, Keypair, PublicKey } from "@solana/web3.js";
import { FastMarketOrder } from "@wormhole-foundation/example-liquidity-layer-definitions";
import { PreparedTransaction } from "@wormhole-foundation/example-liquidity-layer-solana";
import { uint64ToBigInt } from "@wormhole-foundation/example-liquidity-layer-solana/common";
import {
    Auction,
    AuctionInfo,
    CctpMessageArgs,
    EndpointInfo,
    MatchingEngineProgram,
} from "@wormhole-foundation/example-liquidity-layer-solana/matchingEngine";
import { Chain, chainToPlatform, toChainId } from "@wormhole-foundation/sdk-base";
import {
    deserialize,
    keccak256,
    UniversalAddress,
    VAA,
} from "@wormhole-foundation/sdk-definitions";
import { utils as coreUtils } from "@wormhole-foundation/sdk-solana-core";
import "dotenv/config";
import fetch from "node-fetch";
import { Logger } from "winston";
import zmq from "zeromq";
import { utils } from ".";
import {
    AuctionConfigCache,
    AuctionExecutionCandidates,
    AuctionExecutionWithOrder,
    BlockhashCache,
    Config,
    KnownFastOrder,
    KnownFastOrders,
    Payers,
    SlotCache,
} from "./containers";

export const FAST_INTERVAL_MS: number = 5;
export const REQUEST_FAST_TIMEOUT_MS: number = 1_000;
export const REQUEST_SLOW_TIMEOUT_MS: number = 60_000;

export const CCTP_MESSAGES_ENDPOINT: string = "https://iris-api-sandbox.circle.com/messages";
export const CCTP_SOLANA_ATTESTATION_WAIT_MS: number = 30_000;

// Conservatively set to 5 requests per second. You can increase to 10 if you
// trust the endpoint's rate limiting.
export const CCTP_ENDPOINT_MAX_REQUESTS: number = 5;

export const WORMHOLESCAN_VAA_ENDPOINT_TESTNET = "https://api.testnet.wormholescan.io/api/v1/vaas";

// Unknown what the rate limit is, but conservatively set to 5 requests per
// second.
export const WORMSCAN_ENDPOINT_MAX_REQUESTS: number = 5;

export const BASIS_POINT_PRECISION: number = 10_000;

export class ExampleSolver {
    cfg: Config;
    logger: Logger;
    currentBaseFee: bigint;

    payers: Payers;
    matchingEngine: MatchingEngineProgram;
    connection: Connection;
    fastVaaSubscriber: zmq.Subscriber;
    finalizedVaaSubscriber: zmq.Subscriber;
    addressLookupTableAccounts: AddressLookupTableAccount[];

    // Containers

    tokenBalances: Map<string, bigint>;
    auctionConfigs: AuctionConfigCache;
    endpoints: Map<Chain, EndpointInfo>;
    rawFastVaas: Buffer[];
    rawFinalizedVaas: Buffer[];
    knownFastOrders: KnownFastOrders;
    pendingFastMessageHashes: Map<bigint, Uint8Array>;
    newAuctions: Auction[];
    auctionExecutionCandidates: AuctionExecutionCandidates;
    improvedOfferCounts: Map<string, number>;
    cctpAuctionExecutions: AuctionExecutionWithOrder[];
    localAuctionExecutions: AuctionExecutionWithOrder[];
    recognizedTokenAccounts: PublicKey[];
    numEnqueuedTransactions: number = 0;
    transactionRequests: Date[];
    cctpEndpointRequests: Date[];
    wormscanEndpointRequests: Date[];
    guardianSets: Map<number, coreUtils.GuardianSetData>;
    bumpCosts: Map<string, number>;

    // Items set up via async. If initialized == true, these fields are defined.

    initialized: boolean = false;
    slotCache?: SlotCache;
    blockhashCache?: BlockhashCache;

    //

    cctpEnabled: boolean = false;
    localEnabled: boolean = false;
    placeInitialOfferEnabled: boolean = false;
    improveOfferEnabled: boolean = false;
    executeOrderEnabled: boolean = false;
    payerMinimumLamports: bigint = 100_000_000n; // 0.1 SOL by default
    tokenMinimumBalance: bigint = 1_000_000_000n; // 1,000.0 USDC by default

    constructor(cfg: Config, logger: Logger, baseFee: bigint) {
        this.cfg = cfg;
        this.logger = logger;
        this.currentBaseFee = baseFee;
        logger.info(`Setting base fee to ${baseFee.toString()}`);

        this.payers = new Payers();
        this.matchingEngine = cfg.initMatchingEngineProgram();
        this.connection = this.matchingEngine.program.provider.connection;

        // Subscribe.
        this.fastVaaSubscriber = cfg.initSubscriber("fastVaa");
        this.finalizedVaaSubscriber = cfg.initSubscriber("finalizedVaa");

        // Set up containers.
        this.addressLookupTableAccounts = [];
        this.tokenBalances = new Map();
        this.auctionConfigs = new AuctionConfigCache(this.matchingEngine);
        this.endpoints = new Map();
        this.rawFastVaas = [];
        this.rawFinalizedVaas = [];
        this.knownFastOrders = new KnownFastOrders();
        this.pendingFastMessageHashes = new Map();
        this.newAuctions = [];
        this.auctionExecutionCandidates = new AuctionExecutionCandidates();
        this.improvedOfferCounts = new Map<string, number>();
        this.cctpAuctionExecutions = [];
        this.localAuctionExecutions = [];
        this.recognizedTokenAccounts = cfg.recognizedAtaAddresses();
        this.transactionRequests = [];
        this.cctpEndpointRequests = [];
        this.wormscanEndpointRequests = [];
        this.guardianSets = new Map();
        this.bumpCosts = new Map();
    }

    /**
     *
     * Initialize the solver by setting up payer keypairs and initializing
     * `SlotCache` and `BlockhashCache` event loops. Config must specify a valid
     * lookup table address, otherwise this method will throw an error.
     *
     * This method also sets up `SlotCache` and `BlockhashCache` instances.
     *
     * @param payerPrivateKeys base64 encoded private keys
     */
    async initialize(...payerPrivateKeys: (string | undefined)[]) {
        if (this.initialized) {
            throw new Error("Already initialized");
        }

        if (payerPrivateKeys.length == 0) {
            throw new Error("No payers found.");
        }

        const logger = this.logger;
        const payers = this.payers;

        payerPrivateKeys
            .filter((k) => k !== undefined)
            .forEach((privateKey) => {
                const payer = Keypair.fromSecretKey(Buffer.from(privateKey, "base64"));
                payers.add(payer);
                logger.info(`Adding payer: ${payer.publicKey.toString()}`);
            });

        const connection = this.connection;

        const { value: lookupTableAccount } = await connection.getAddressLookupTable(
            this.cfg.addressLookupTable(),
        );
        if (lookupTableAccount === null) {
            throw new Error("Address lookup table not found");
        }
        this.addressLookupTableAccounts = [lookupTableAccount];

        this.slotCache = await SlotCache.initialize(connection);
        this.blockhashCache = await BlockhashCache.initialize(
            connection,
            32, // slots
            "finalized",
            logger,
        );

        await this._initializePayers();

        this._initializeRequestsTrackers();
        this._initializeVaaObserver();
        this._initializeAuctionObserver();
        this._initializeExecutionObserver();

        this.initialized = true;
    }

    canSendTransactions(
        numTransactions: number,
        includePendingExecutions: boolean = true,
    ): boolean {
        const pendingExecutions = includePendingExecutions
            ? this.cctpAuctionExecutions.length + 2 * this.localAuctionExecutions.length
            : 0;
        return (
            this._transactionsInFlight() + pendingExecutions + numTransactions <=
            this.cfg.maxTransactionsPerSecond()
        );
    }

    enqueueTransactions(numTransactions: number) {
        this.numEnqueuedTransactions += numTransactions;
        this.logger.debug(`Enqueued transactions: ${this.numEnqueuedTransactions}`);
    }

    pushRequestTime(requestType: "CCTP" | "Transaction" | "Wormscan", extraTime?: number) {
        const now = new Date();
        if (extraTime !== undefined) {
            now.setMilliseconds(now.getMilliseconds() + extraTime);
            this.logger.debug(
                `Adding in-flight ${requestType} request with extra time: ${extraTime}`,
            );
        }

        let requests;
        if (requestType == "CCTP") {
            requests = this.cctpEndpointRequests;
        } else if (requestType == "Wormscan") {
            requests = this.wormscanEndpointRequests;
        } else {
            requests = this.transactionRequests;
        }

        requests.push(now);
        this.logger.debug(`${requestType} requests: ${requests.length}`);
    }

    /**
     * In this example, this only has hard-coded compute unit and priority fee
     * values. You may want to add sophistication here to scale priority fees
     * based on the urgency of the transaction and compute units depending on
     * which PDAs are derived on-chain (1500 CU per bump iteration per key).
     *
     * @param method Specific prepared transaction method.
     */
    computeUnitsAndPriorityFee(
        method:
            | "verifySignatures"
            | "postVaa"
            | "placeInitialOffer"
            | "improveOffer"
            | "reserveFastFillSequenceActiveAuction"
            | "executeOrderCctp"
            | "executeOrderLocal"
            | "reclaimCctpMessage"
            | "prepareOrderResponseCctp"
            | "settleAuctionComplete",
    ): { computeUnits: number; feeMicroLamports: number } {
        if (method == "verifySignatures") {
            // **NOTES**
            //
            // First verify signatures call requires more CU because the
            // signature set account is created.
            //
            // PDA addresses derived in this instruction:
            // - guardian set
            return { computeUnits: 100_000, feeMicroLamports: 10 };
        } else if (method == "postVaa") {
            // **NOTES**
            //
            // The post VAA instruction is a no-op if the VAA has already been
            // posted. So if someone beats you at posting the VAA, the CU
            // specified will be wasted.
            //
            // PDA addresses derived in this instruction:
            // - guardian set
            // - config
            // - posted VAA
            //
            // Also in this example, we combine the post VAA and place initial
            // offer instructions in the same transaction. Because there can be
            // a race to place the initial offer, we want to guarantee failure
            // if someone actually placed the offer before us (so we do not
            // waste lamports on posting the VAA beforehand, which may end up
            // being a no-op, plus sending a separate transaction will add
            // latency to placing the initial offer).
            return { computeUnits: 150_000, feeMicroLamports: 10 };
        } else if (method == "placeInitialOffer") {
            // **NOTES**
            //
            // You may want to scale the priority fee based on the size of the
            // transfer amount. However, there is a risk of losing the lamports
            // spent to execute the transaction (5,000 + CU * priority) if the
            // transaction fails (which can happen since this transaction is
            // sent without preflight). Your offers should account for the
            // likelihood of offer transaction failures.
            //
            // PDA addresses derived in this instruction:
            // - transfer authority
            // - auction
            // - auction custody token account
            // - matching engine event authority
            //
            // Also in this example, we combine the post VAA and place initial
            // offer instructions in the same transaction. Because there can be
            // a race to place the initial offer, we want to guarantee failure
            // if someone actually placed the offer before us (so we do not
            // waste lamports on posting the VAA beforehand, which may end up
            // being a no-op, plus sending a separate transaction will add
            // latency to placing the initial offer).
            return { computeUnits: 100_000, feeMicroLamports: 10 };
        } else if (method == "improveOffer") {
            // **NOTES**
            //
            // You may want to scale the priority fee based on the size of the
            // transfer amount. However, there is a risk of losing the lamports
            // spent to execute the transaction (5,000 + CU * priority) if the
            // transaction fails (which can happen since this transaction is
            // sent without preflight). Your offers should account for the
            // likelihood of offer transaction failures.
            //
            // PDA addresses derived in this instruction:
            // - transfer authority
            // - matching engine event authority
            return { computeUnits: 60_000, feeMicroLamports: 10 };
        } else if (method == "reserveFastFillSequenceActiveAuction") {
            // **NOTES**
            //
            // If the fast fill sequencer has not been created yet, this
            // instruction will require more CU to create that account.
            //
            // PDA addresses derived in this instruction:
            // - fast fill sequencer
            // - reserved fast fill sequence
            // - auction
            // - matching engine event authority
            return { computeUnits: 100_000, feeMicroLamports: 10 };
        } else if (method == "executeOrderCctp") {
            // **NOTES**
            //
            // Once the CCTP attestation exists, you should close the CCTP
            // message account to reclaim those lamports.
            //
            // PDA addresses derived in this instruction:
            // - cctp token messenger minter sender authority
            // - core message
            // - cctp message
            // - token messenger minter event authority
            // - matching engine event authority
            return { computeUnits: 300_000, feeMicroLamports: 10 };
        } else if (method == "executeOrderLocal") {
            // **NOTES**
            //
            // PDA addresses derived in this instruction:
            // - fast fill
            // - matching engine event authority
            return { computeUnits: 300_000, feeMicroLamports: 10 };
        } else if (method == "reclaimCctpMessage") {
            // **NOTES**
            //
            // Compute units are based on however many signatures need to be
            // verified from the attestation plus the CU to hash the message
            // (which should have been done using the Solana syscall to save
            // on CU).
            return { computeUnits: 120_000, feeMicroLamports: 10 };
        } else if (method == "prepareOrderResponseCctp") {
            return { computeUnits: 300_000, feeMicroLamports: 10 };
        } else if (method == "settleAuctionComplete") {
            return { computeUnits: 100_000, feeMicroLamports: 10 };
        } else {
            throw new Error(`Unknown method for transaction: ${method}`);
        }
    }

    // Methods to enable specific activity.

    enableCctpOrderPipeline() {
        if (!this.cctpEnabled) {
            this.cctpEnabled = true;
            this.logger.info("Enabled CCTP order pipeline");
        }
    }

    enableLocalOrderPipeline() {
        if (!this.localEnabled) {
            this.localEnabled = true;
            this.logger.info("Enabled local order pipeline");
        }
    }

    enablePlaceInitialOffer() {
        if (!this.placeInitialOfferEnabled) {
            this.placeInitialOfferEnabled = true;
            this.logger.info("Enabled place initial offer");
        }
        this.enableExecuteOrder();
    }

    enableImproveOffer() {
        if (!this.improveOfferEnabled) {
            this.improveOfferEnabled = true;
            this.logger.info("Enabled improve offer");
        }
        this.enableExecuteOrder();
    }

    enableExecuteOrder() {
        if (!this.executeOrderEnabled) {
            this.executeOrderEnabled = true;
            this.logger.info("Enabled execute order");
        }
    }

    updatePayerMinimumLamports(lamports: bigint) {
        this.payerMinimumLamports = lamports;
        this.logger.info(`Updated payer minimum lamports to ${lamports.toString()}`);
    }

    updateTokenMinimumBalance(balance: bigint) {
        this.tokenMinimumBalance = balance;
        this.logger.info(`Updated token minimum balance to ${balance.toString()}`);
    }

    // Event loops.

    private _initializeRequestsTrackers() {
        const logger = this.logger;

        // Transactions
        logger.info(`Max transactions per second: ${this.cfg.maxTransactionsPerSecond()}`);

        const transactionRequests = this.transactionRequests;

        setInterval(() => {
            const now = new Date();

            while (transactionRequests.length > 0) {
                const oldest = transactionRequests[0];
                if (now.getTime() - oldest.getTime() < REQUEST_FAST_TIMEOUT_MS) {
                    break;
                }

                transactionRequests.shift();
                logger.info(`Remaining Transaction requests: ${transactionRequests.length}`);
            }
            //}, 200);
        }, FAST_INTERVAL_MS);

        // Requesting CCTP attestations.
        const cctpEndpointRequests = this.cctpEndpointRequests;

        setInterval(() => {
            const now = new Date();

            while (cctpEndpointRequests.length > 0) {
                const oldest = cctpEndpointRequests[0];
                if (now.getTime() - oldest.getTime() < REQUEST_FAST_TIMEOUT_MS) {
                    break;
                }

                cctpEndpointRequests.shift();
                logger.info(`Remaining CCTP requests: ${cctpEndpointRequests.length}`);
            }
        }, FAST_INTERVAL_MS);

        // Requesting Wormscan info.
        const wormscanEndpointRequests = this.wormscanEndpointRequests;

        setInterval(() => {
            const now = new Date();

            while (wormscanEndpointRequests.length > 0) {
                const oldest = wormscanEndpointRequests[0];
                if (now.getTime() - oldest.getTime() < REQUEST_FAST_TIMEOUT_MS) {
                    break;
                }

                wormscanEndpointRequests.shift();
                logger.info(`Remaining Wormscan requests: ${wormscanEndpointRequests.length}`);
            }
        }, FAST_INTERVAL_MS);
    }

    private _initializeVaaObserver() {
        const self = this;

        // Handle listening to raw fast VAAs.

        const rawFastVaas = this.rawFastVaas;
        const fastVaaSubscriber = this.fastVaaSubscriber;

        // Whenever the subscriber hears a new fast VAA, push it to the raw fast
        // VAA list.
        (async function () {
            for await (const [, rawVaa] of fastVaaSubscriber) {
                rawFastVaas.push(rawVaa);
            }
        })();

        const rawFinalizedVaas = this.rawFinalizedVaas;
        const finalizedVaaSubscriber = this.finalizedVaaSubscriber;

        (async function () {
            for await (const [, rawVaa] of finalizedVaaSubscriber) {
                rawFinalizedVaas.push(rawVaa);
            }
        })();

        // Handle placing initial offers if enabled. Otherwise just keep track
        // of the fast VAAs.

        const connection = this.connection;
        const knownFastOrders = this.knownFastOrders;
        const matchingEngine = this.matchingEngine;
        const logger = this.logger;
        const payers = this.payers;

        const auctionListenerIdsAndData = new Map<string, { listenerId: number; data?: Buffer }>();
        const newAuctions = this.newAuctions;

        const deferredFastOrders: KnownFastOrder[] = [];

        setInterval(() => {
            if (rawFastVaas.length > 0) {
                const parsed = deserialize("Uint8Array", rawFastVaas.shift()!);
                const fastOrder = utils.tryParseFastMarketOrder(Buffer.from(parsed.payload));

                if (fastOrder === undefined) {
                    logger.warn(`Failed to parse FastMarketOrder, sequence=${parsed.sequence}`);
                    return;
                }

                if (
                    self.placeInitialOfferEnabled &&
                    ((self.cctpEnabled && fastOrder.targetChain != "Solana") ||
                        (self.localEnabled && fastOrder.targetChain == "Solana"))
                ) {
                    const numTransactions = Math.ceil(parsed.signatures.length / 7) + 2;
                    if (self.canSendTransactions(numTransactions)) {
                        self.enqueueTransactions(numTransactions);

                        const payer = payers.useNext();
                        if (payer === null) {
                            logger.error("No payers available! Cannot place initial offer");
                            return;
                        }

                        self._handleInitialOffer(payer, parsed, fastOrder).then(() =>
                            this.enqueueTransactions(-numTransactions),
                        );
                    } else {
                        logger.warn("Place initial offer throttled. Deferring order");
                        deferredFastOrders.push({ parsed, fastOrder });
                    }
                }

                // We may not be successful with placing the initial offer. But
                // we may place an improved offer. So we keep track of the VAA
                // by the fast VAA hash (in Wormhole terms, hash of the message
                // hash).
                knownFastOrders.add(parsed, fastOrder);

                const auction = matchingEngine.auctionAddress(keccak256(parsed.hash));
                const auctionKey = auction.toString();

                // Subscribe to auction account.
                const auctionListenerId = connection.onAccountChange(
                    auction,
                    ({ data }, { slot }) => {
                        const stored = auctionListenerIdsAndData.get(auctionKey);

                        if (stored == undefined) {
                            logger.error(
                                `Auction listener not found for sequence=${parsed.sequence}`,
                            );
                            return;
                        }

                        // Deserialize the auction to determine its status.
                        // If it is settled, clean up the listener.
                        const auctionData = matchingEngine.program.coder.accounts.decode(
                            "auction",
                            data,
                        );

                        if (auctionData.status.settled !== undefined) {
                            connection.removeAccountChangeListener(stored.listenerId);
                            auctionListenerIdsAndData.delete(auctionKey);

                            if (auctionData.info !== null) {
                                logger.info(`Auction ${auctionKey} at ${slot}. settled`);
                                return;
                            }

                            logger.info(
                                `Auction ${auctionKey} at ${slot}: settled, sequence: ${auctionData.info.vaaSequence}`,
                            );

                            // TODO: kick off to add to auction history.
                        } else if (stored.data === undefined || !data.equals(stored.data)) {
                            if (auctionData.info !== null) {
                                newAuctions.push(auctionData);

                                if (auctionData.status.active !== undefined) {
                                    logger.info(
                                        `Auction ${auctionKey} at ${slot}: active, sequence: ${auctionData.info.vaaSequence}`,
                                    );
                                } else if (auctionData.status.completed !== undefined) {
                                    const completedStatus =
                                        auctionData.status.completed.executePenalty === null
                                            ? "completed"
                                            : "completed with penalty";
                                    logger.info(
                                        `Auction ${auctionKey} at ${slot}: ${completedStatus}, sequence: ${auctionData.info.vaaSequence}`,
                                    );
                                }
                            } else {
                                const status =
                                    auctionData.status.settled !== undefined
                                        ? "settled"
                                        : auctionData.status.completed !== undefined
                                        ? "completed"
                                        : "active";
                                logger.info(`Auction ${auctionKey} at ${slot}: ${status}`);
                            }

                            // Update the stored data.
                            stored.data = data;
                            auctionListenerIdsAndData.set(auctionKey, stored);
                        }
                    },
                    { commitment: "processed", encoding: "base64" },
                );

                // Set with the finalized VAA sequence for clean up when we hear
                // the finalized VAA.
                auctionListenerIdsAndData.set(auctionKey, { listenerId: auctionListenerId });
            }
        }, FAST_INTERVAL_MS);

        // Attempt to start auctions for those VAAs that were deferred (throttled). Unlikely to be
        // successful. But this acts as a backstop in case other solvers do not pick up the order.
        setInterval(async () => {
            if (deferredFastOrders.length > 0) {
                const { parsed, fastOrder } = deferredFastOrders.pop()!;
                const numTransactions = Math.ceil(parsed.signatures.length / 7) + 2;

                await self._waitForZeroTransactionRequests();

                self.enqueueTransactions(numTransactions);

                const payer = payers.useNext();
                if (payer === null) {
                    logger.error("No payers available! Cannot place initial offer");
                    return;
                }

                self._handleInitialOffer(payer, parsed, fastOrder).then(() =>
                    this.enqueueTransactions(-numTransactions),
                );
            }
        }, FAST_INTERVAL_MS);

        const cfg = this.cfg;
        const pendingFastMessageHashes = this.pendingFastMessageHashes;

        // The solver should already be initialized so this operation is safe.
        const blockhashCache = this.blockhashCache!;

        const cachedWormscanResponses = new Map<string, string>();

        // Listen to finalized VAAs to settle orders.
        setInterval(async () => {
            if (rawFinalizedVaas.length > 0) {
                const rawVaa = rawFinalizedVaas.shift()!;
                const parsed = deserialize("Uint8Array", rawVaa);
                const orderResponse = utils.tryParseSlowOrderResponse(Buffer.from(parsed.payload));

                if (orderResponse === undefined) {
                    logger.warn(
                        `Unknown finalized VAA from ${parsed.emitterChain}. sequence: ${parsed.sequence}`,
                    );
                    return;
                }

                const fastSequence = parsed.sequence + 1n;

                const messageHash = pendingFastMessageHashes.get(fastSequence);
                if (messageHash === undefined) {
                    return;
                }

                const { sourceCctpDomain, cctpNonce, baseFee } = orderResponse;

                if (self.currentBaseFee !== baseFee) {
                    self.currentBaseFee = baseFee;
                    logger.warn(`Updating base fee to ${baseFee.toString()}`);
                }

                const wormscanKey = Buffer.from(messageHash).toString("base64");
                let sourceTxHash = cachedWormscanResponses.get(wormscanKey);

                if (sourceTxHash === undefined) {
                    await self._waitForWormscanEndpoint();

                    const fetchedTxHash = await this._fetchWormscanTxHash(parsed);
                    if (fetchedTxHash === null) {
                        // Add this raw VAA back to the queue if failed.
                        setTimeout(() => rawFinalizedVaas.push(rawVaa), REQUEST_SLOW_TIMEOUT_MS);
                        return;
                    }
                    sourceTxHash = fetchedTxHash;
                    cachedWormscanResponses.set(wormscanKey, fetchedTxHash);
                }

                await self._waitForCctpEndpoint();

                const cctpResponse = await self._fetchCctpMessages(sourceCctpDomain, sourceTxHash);
                if (cctpResponse === null) {
                    // Add this raw VAA back to the queue if failed.
                    setTimeout(() => rawFinalizedVaas.push(rawVaa), REQUEST_SLOW_TIMEOUT_MS);
                    return;
                }

                // Clean up the Wormscan cache since the CCTP response was
                // successful.
                cachedWormscanResponses.delete(wormscanKey);
                logger.info(
                    `Order response from ${parsed.emitterChain}: fast sequence: ${fastSequence}, CCTP nonce: ${cctpNonce}`,
                );

                const cctpResult = cctpResponse.find(({ eventNonce }) => eventNonce == cctpNonce);
                if (cctpResult === undefined) {
                    logger.error(`CCTP message not found for nonce ${cctpNonce}`);

                    // We will give up at this point since the CCTP endpoint
                    // does not agree with the data in the fetched transaction
                    // determined by the Wormscan endpoint.
                    return;
                }

                const fastVaaHash = keccak256(messageHash);
                const { parsed: fastVaa, fastOrder } = knownFastOrders.get(keccak256(messageHash))!;

                await self._waitForZeroTransactionRequests();

                const numTransactions = Math.ceil(parsed.signatures.length / 7) + 1;
                self.enqueueTransactions(numTransactions);

                const payer = payers.useNext();
                if (payer === null) {
                    logger.error("No payers available! Cannot settle order");
                    return;
                }

                self._handleFinalizedOrder(payer, fastVaa, parsed, fastOrder, {
                    encodedCctpMessage: cctpResult.message,
                    cctpAttestation: cctpResult.attestation,
                }).then(() => {
                    self.enqueueTransactions(-numTransactions);

                    (async function () {
                        const auction = matchingEngine.auctionAddress(fastVaaHash);
                        const { info } = await matchingEngine.fetchAuction({ address: auction });

                        const settleAuctionCompleteIx =
                            await matchingEngine.settleAuctionCompleteIx({
                                beneficiary: payer.publicKey,
                                auction,
                                preparedOrderResponse:
                                    matchingEngine.preparedOrderResponseAddress(fastVaaHash),
                                bestOfferToken: info!.bestOfferToken,
                                baseFeeToken: cfg.ataAddress(payer.publicKey),
                            });

                        await self._waitForZeroTransactionRequests();
                        self.enqueueTransactions(1);

                        const txSig = await utils.sendTransaction(
                            connection,
                            {
                                ixs: [settleAuctionCompleteIx],
                                signers: [payer],
                                ...self.computeUnitsAndPriorityFee("settleAuctionComplete"),
                                txName: "settleAuctionComplete",
                                confirmOptions: {
                                    preflightCommitment: "processed",
                                    commitment: "confirmed",
                                },
                            },
                            blockhashCache.latest,
                            logger,
                        );
                        self.pushRequestTime("Transaction");
                        self.enqueueTransactions(-1);
                        if (txSig === null) {
                            logger.error(`Auction ${auction.toString()} failed to settle`);
                        }
                    })();
                });
            }
        }, FAST_INTERVAL_MS);

        logger.info("Listening to VAAs");
    }

    private async _waitForWormscanEndpoint() {
        while (this.wormscanEndpointRequests.length >= WORMSCAN_ENDPOINT_MAX_REQUESTS) {
            this.logger.debug("Throttling Wormscan endpoint requests...");
            await new Promise((resolve) => setTimeout(resolve, REQUEST_FAST_TIMEOUT_MS));
        }
    }

    private async _waitForCctpEndpoint() {
        while (this.cctpEndpointRequests.length >= CCTP_ENDPOINT_MAX_REQUESTS) {
            this.logger.debug("Throttling CCTP endpoint requests...");
            await new Promise((resolve) => setTimeout(resolve, REQUEST_FAST_TIMEOUT_MS));
        }
    }

    private async _waitForZeroTransactionRequests() {
        while (this._transactionsInFlight() > 0) {
            this.logger.debug("Waiting for zero transaction requests...");
            await new Promise((resolve) => setTimeout(resolve, 2 * REQUEST_FAST_TIMEOUT_MS));
        }
    }

    private _initializeAuctionObserver() {
        // This may need to be tuned.
        const IMPROVE_OFFER_WAIT_BUFFER_MS: number = 395;

        const self = this;

        const auctionConfigs = this.auctionConfigs;
        const auctionExecutionCandidates = this.auctionExecutionCandidates;
        const cfg = this.cfg;
        const knownFastOrders = this.knownFastOrders;
        const logger = this.logger;
        const newAuctions = this.newAuctions;

        // The solver should already be initialized so this operation is safe.
        const slotCache = this.slotCache!;

        const recognizedTokenAccounts = cfg.recognizedAtaAddresses();

        // Auctions.

        setInterval(async () => {
            while (newAuctions.length > 0) {
                const auctionData = newAuctions.shift()!;
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

                const { slot: currentSlot, localTimestamp } = slotCache.current;
                const auctionInfo = auctionData.info!;

                // Fetch the config if we haven't already.
                const auctionConfig = await auctionConfigs.get(auctionInfo.configId);

                // Figure out the end slot.
                const endSlot = uint64ToBigInt(
                    auctionInfo.startSlot.addn(auctionConfig.parameters.duration),
                );
                logger.debug(
                    `Current slot: ${currentSlot}, slots left for auction: ${
                        endSlot - currentSlot
                    }`,
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
                } else if (knownFastOrders.has(fastVaaHash) && self.improveOfferEnabled) {
                    auctionExecutionCandidates.update(fastVaaHash, false);
                    logger.info(`Unrecognized token account: ${bestOfferToken.toString()}`);

                    // No await, just fire away.
                    self._handleBestOffer(
                        fastVaaHash,
                        auctionInfo,
                        currentSlot,
                        endSlot,
                        localTimestamp,
                        IMPROVE_OFFER_WAIT_BUFFER_MS,
                    );
                }
            }
        }, FAST_INTERVAL_MS);

        logger.info("Listening to auctions");
    }

    private async _initializePayers() {
        const cfg = this.cfg;
        const connection = this.connection;
        const logger = this.logger;
        const payers = this.payers;
        const tokenBalances = this.tokenBalances;

        const self = this;

        const payerLamports = new Map<string, bigint>();

        const payerPubkeys = cfg.knownAtaOwners();

        for (const payer of payerPubkeys) {
            const ata = cfg.ataAddress(payer);
            const key = payer.toString();

            // First fetch balances.
            const lamports = await connection.getBalance(payer);
            payerLamports.set(key, BigInt(lamports));

            const { amount: tokenBalance } = await splToken.getAccount(connection, ata);
            tokenBalances.set(key, tokenBalance);

            const slot = await connection.getSlot();

            function setEnabled(lamports: bigint, tokenBalance: bigint, slot: number) {
                const shouldEnable =
                    lamports >= self.payerMinimumLamports &&
                    tokenBalance >= self.tokenMinimumBalance;
                const wasEnabled = payers.setEnabled(payer, shouldEnable);
                if (wasEnabled != shouldEnable) {
                    if (shouldEnable) {
                        logger.info(`Payer ${key} at ${slot}: enabled`);
                    } else {
                        logger.warn(`Payer ${key} at ${slot}: disabled`);
                    }
                }
            }

            logger.info(
                `Payer ${key} at ${slot}: lamports: ${lamports}, token balance: ${tokenBalance}`,
            );
            setEnabled(BigInt(lamports), tokenBalance, slot);

            // Do not bother saving listener IDs.

            connection.onAccountChange(
                payer,
                ({ lamports }, { slot }) => {
                    const balance = BigInt(lamports);
                    payerLamports.set(key, balance);
                    setEnabled(balance, tokenBalances.get(key)!, slot);
                    logger.info(`Payer ${key} at ${slot}: lamports: ${balance.toString()}`);
                },
                { commitment: "processed", encoding: "base64" },
            );

            connection.onAccountChange(
                ata,
                (info, { slot }) => {
                    const { amount } = splToken.unpackAccount(ata, info);
                    tokenBalances.set(key, amount);
                    setEnabled(payerLamports.get(key)!, amount, slot);
                    logger.info(`Payer ${key} at ${slot}: token balance: ${amount.toString()}`);
                },
                { commitment: "processed", encoding: "base64" },
            );
        }

        logger.info("Listening to payers");
    }

    private _initializeExecutionObserver() {
        const EXECUTE_CCTP_ORDER_DELAY_MS: number = 800;
        const RESERVE_SEQUENCE_DELAY_MS: number = 800;

        const auctionExecutionCandidates = this.auctionExecutionCandidates;
        const knownFastOrders = this.knownFastOrders;
        const logger = this.logger;
        const matchingEngine = this.matchingEngine;

        // The solver should already be initialized so this operation is safe.
        const slotCache = this.slotCache!;

        const cctpAuctionExecutions = this.cctpAuctionExecutions;
        const localAuctionExecutions = this.localAuctionExecutions;

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
        }, FAST_INTERVAL_MS);

        const addressLookupTableAccounts = this.addressLookupTableAccounts;
        const cfg = this.cfg;
        const connection = this.connection;
        const payers = this.payers;
        const pendingFastMessageHashes = this.pendingFastMessageHashes;

        // The solver should already be initialized so this operation is safe.
        const blockhashCache = this.blockhashCache!;

        const coreBridgeProgramId = matchingEngine.coreBridgeProgramId();

        const self = this;

        // CCTP.

        setInterval(() => {
            if (cctpAuctionExecutions.length != 0 && self.canSendTransactions(1, false)) {
                self.enqueueTransactions(1);

                const { fastVaaHash, preparedBy, auctionInfo, parsed, fastOrder } =
                    cctpAuctionExecutions.shift()!;

                if (!self.executeOrderEnabled) {
                    self.enqueueTransactions(-1);
                    logger.warn("CCTP order execution disabled");
                    return;
                }

                const payer = payers.useNext();
                if (payer === null) {
                    logger.error("No payers available! Cannot execute CCTP order");
                    return;
                }

                const auction = matchingEngine.auctionAddress(fastVaaHash);

                matchingEngine
                    .executeFastOrderCctpTx(
                        {
                            payer: payer.publicKey,
                            fastVaa: coreUtils.derivePostedVaaKey(
                                coreBridgeProgramId,
                                Buffer.from(parsed.hash),
                            ),
                            executorToken: cfg.ataAddress(payer.publicKey),
                            auction,
                            auctionConfig: matchingEngine.auctionConfigAddress(
                                auctionInfo.configId,
                            ),
                            bestOfferToken: auctionInfo.bestOfferToken,
                            initialOfferToken: auctionInfo.initialOfferToken,
                            initialParticipant: preparedBy,
                        },
                        toChainId(fastOrder.targetChain),
                        [payer],
                        {
                            addressLookupTableAccounts,
                            ...self.computeUnitsAndPriorityFee("executeOrderCctp"),
                        },
                        {
                            preflightCommitment: "processed",
                        },
                    )
                    .then(async (tx) => {
                        const txSig = await utils.sendTransaction(
                            connection,
                            tx,
                            blockhashCache.latest,
                            logger,
                            {
                                delay: EXECUTE_CCTP_ORDER_DELAY_MS,
                                retryCount: 1,
                                retryTimeoutMs: REQUEST_FAST_TIMEOUT_MS,
                            },
                        );
                        self.pushRequestTime("Transaction");
                        self.enqueueTransactions(-1);
                        return txSig;
                    })
                    .then((txSig) => {
                        if (txSig === null) {
                            logger.error(`Cannot execute CCTP order: ${auction.toString()}`);
                            return;
                        }

                        pendingFastMessageHashes.set(parsed.sequence, parsed.hash);

                        (async function () {
                            let cctpResponse = null;

                            while (cctpResponse === null) {
                                await new Promise((resolve) =>
                                    setTimeout(resolve, CCTP_SOLANA_ATTESTATION_WAIT_MS),
                                );

                                await self._waitForCctpEndpoint();

                                cctpResponse = await self._fetchCctpMessages(5, txSig);
                            }

                            const tx = await matchingEngine.reclaimCctpMessageTx(
                                {
                                    payer: payer.publicKey,
                                    cctpMessage: matchingEngine.cctpMessageAddress(
                                        matchingEngine.auctionAddress(fastVaaHash),
                                    ),
                                },
                                cctpResponse[0].attestation,
                                [payer],
                                self.computeUnitsAndPriorityFee("reclaimCctpMessage"),
                            );

                            await self._waitForZeroTransactionRequests();

                            self.enqueueTransactions(1);
                            await utils.sendTransaction(
                                connection,
                                tx,
                                blockhashCache.latest,
                                logger,
                            );
                            self.pushRequestTime("Transaction");
                            self.enqueueTransactions(-1);
                        })();
                    });
            }
        }, FAST_INTERVAL_MS);

        // Local.

        setInterval(async () => {
            if (localAuctionExecutions.length != 0 && self.canSendTransactions(2, false)) {
                self.enqueueTransactions(2);

                const { fastVaaHash, preparedBy, auctionInfo, parsed, fastOrder } =
                    localAuctionExecutions.shift()!;

                if (!self.executeOrderEnabled) {
                    self.enqueueTransactions(-2);
                    logger.warn("Local order execution disabled");
                    return;
                }

                const payer = payers.useNext();
                if (payer === null) {
                    logger.error("No payers available! Cannot execute local order");
                    return;
                }

                // First check if the reserved fast fill sequence has already
                // been created.
                const alreadyReserved = await matchingEngine
                    .fetchReservedFastFillSequence(fastVaaHash)
                    .then(() => true)
                    .catch(() => false);

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
                        self.computeUnitsAndPriorityFee("executeOrderLocal"),
                        {
                            preflightCommitment: "processed",
                            commitment: "confirmed",
                        },
                    )
                    .then(async (tx) => {
                        if (alreadyReserved) {
                            logger.info(
                                `Fast fill sequence already reserved: ${fastVaaHash.toString(
                                    "base64",
                                )}`,
                            );
                            return null;
                        }

                        const txSig = await utils.sendTransaction(
                            connection,
                            tx,
                            blockhashCache.latest,
                            logger,
                            {
                                delay: RESERVE_SEQUENCE_DELAY_MS,
                                retryCount: 1,
                                retryTimeoutMs: REQUEST_FAST_TIMEOUT_MS,
                            },
                        );
                        self.pushRequestTime("Transaction");
                        self.enqueueTransactions(-1);
                        if (txSig === null) {
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
                                addressLookupTableAccounts,
                                ...self.computeUnitsAndPriorityFee("executeOrderLocal"),
                            },
                            { skipPreflight: true, commitment: "confirmed" },
                        ),
                    )
                    .catch((err) => {
                        logger.error(err);
                        return null;
                    })
                    .then(async (tx) => {
                        if (tx === null) {
                            return null;
                        }

                        const txSig = await utils.sendTransaction(
                            connection,
                            tx,
                            blockhashCache.latest,
                            logger,
                        );
                        self.pushRequestTime("Transaction");
                        self.enqueueTransactions(-1);
                        return txSig;
                    })
                    .then((txSig) => {
                        // Should never happen. But if you send transactions
                        // with preflight, you should change this log message.
                        if (txSig === null) {
                            logger.error(
                                `Failed to execute local order skipping preflight: ${fastVaaHash.toString(
                                    "base64",
                                )}`,
                            );
                            return;
                        }

                        pendingFastMessageHashes.set(parsed.sequence, parsed.hash);
                    });
            }
        }, FAST_INTERVAL_MS);

        logger.info("Listening to execution candidates");
    }

    // Other helpers.

    private _transactionsInFlight(): number {
        return Math.max(this.transactionRequests.length, this.numEnqueuedTransactions);
    }

    private async _handleFinalizedOrder(
        payer: Keypair,
        fastVaa: VAA,
        finalizedVaa: VAA,
        fastMarketOrder: FastMarketOrder,
        cctpArgs: CctpMessageArgs,
    ): Promise<undefined> {
        const addressLookupTableAccounts = this.addressLookupTableAccounts;
        const connection = this.connection;
        const logger = this.logger;
        const matchingEngine = this.matchingEngine;

        // The solver should already be initialized so this operation is safe.
        const blockhashCache = this.blockhashCache!;

        logger.debug(`Prepare verify signatures and post VAA, sequence=${finalizedVaa.sequence}`);
        const { postedVaa: finalizedVaaAccount, txs: verifySigsTxs } =
            await this._prepareVerificationTxs(payer, finalizedVaa);
        logger.debug(
            `Process ${verifySigsTxs.length} transactions to verify signatures and post VAA`,
        );

        // Attempt to post the VAA and place the initial offer in the same
        // transaction.
        const {
            ixs: [postVaaIx],
            computeUnits: postVaaComputeUnits,
        } = verifySigsTxs.pop()!;

        logger.debug(`Prepare order response, sequence=${fastVaa.sequence}`);

        const { computeUnits, feeMicroLamports } = this.computeUnitsAndPriorityFee(
            "prepareOrderResponseCctp",
        );
        const prepareOrderResponseTx = await matchingEngine.prepareOrderResponseCctpTx(
            {
                payer: payer.publicKey,
                fastVaa: coreUtils.derivePostedVaaKey(
                    matchingEngine.coreBridgeProgramId(),
                    Buffer.from(fastVaa.hash),
                ),
                finalizedVaa: finalizedVaaAccount,
                fromRouterEndpoint: matchingEngine.routerEndpointAddress(
                    toChainId(finalizedVaa.emitterChain),
                ),
            },
            { fastMarketOrder, fastVaaHash: keccak256(fastVaa.hash), ...cctpArgs },
            [payer],
            {
                addressLookupTableAccounts,
                computeUnits: postVaaComputeUnits + computeUnits,
                feeMicroLamports,
            },
            {
                preflightCommitment: "processed",
                commitment: "confirmed",
            },
        );

        // Send all verify signatures at once.
        await Promise.allSettled(
            verifySigsTxs.map(async (tx) => {
                await utils.sendTransaction(connection, tx, blockhashCache.latest, logger);
                this.pushRequestTime("Transaction");
            }),
        );

        prepareOrderResponseTx.ixs = [postVaaIx, ...prepareOrderResponseTx.ixs];

        await utils.sendTransaction(
            connection,
            prepareOrderResponseTx,
            blockhashCache.latest,
            logger,
        );
        this.pushRequestTime("Transaction");
    }

    private async _handleBestOffer(
        fastVaaHash: Buffer,
        auctionInfo: AuctionInfo,
        currentSlot: bigint,
        endSlot: bigint,
        localTimestamp: number,
        sendWaitBuffer: number,
    ) {
        const cfg = this.cfg;
        const improvedOfferCounts = this.improvedOfferCounts;
        const logger = this.logger;
        const matchingEngine = this.matchingEngine;
        const payers = this.payers;

        // The solver should already be initialized so this operation is safe.
        const blockhashCache = this.blockhashCache!;

        const auctionConfig = await this.auctionConfigs.get(auctionInfo.configId);

        const auctionKey = fastVaaHash.toString("base64");
        let offerCount = (improvedOfferCounts.get(auctionKey) ?? 0) + 1;
        improvedOfferCounts.set(auctionKey, offerCount);

        const auction = matchingEngine.auctionAddress(fastVaaHash);

        // We cannot participate with an offer at this point.
        if (currentSlot >= endSlot) {
            logger.warn(`Skipping ended auction: ${auction.toString()}`);
            return;
        }

        const sourceChain = auctionInfo.sourceChain;
        const pricingParams = cfg.pricingParameters(sourceChain);
        if (pricingParams === null) {
            logger.error(`No pricing parameters found for source chain: ${sourceChain}`);
            return;
        }

        const amountIn = uint64ToBigInt(auctionInfo.amountIn);
        const offerPrice = uint64ToBigInt(auctionInfo.offerPrice);
        const minOfferDelta = await matchingEngine.computeMinOfferDelta(
            offerPrice,
            auctionConfig.parameters,
        );
        const maxOfferPriceAllowed = offerPrice - minOfferDelta;

        const fairValue =
            (uint64ToBigInt(amountIn) *
                BigInt(pricingParams.rollbackRisk * BASIS_POINT_PRECISION)) /
            BigInt(BASIS_POINT_PRECISION);
        const fairValueWithEdge =
            fairValue +
            (fairValue * BigInt(pricingParams.offerEdge * BASIS_POINT_PRECISION)) /
                BigInt(BASIS_POINT_PRECISION);

        if (fairValueWithEdge > maxOfferPriceAllowed) {
            logger.warn(`Skipping too low offer: ${maxOfferPriceAllowed.toString()}`);
            return;
        }

        const payer = payers.useNext();
        if (payer === null) {
            logger.error("No payers available! Cannot improve offer");
            return;
        }

        const tx = await matchingEngine.improveOfferTx(
            {
                participant: payer.publicKey,
                auction,
                auctionConfig: matchingEngine.auctionConfigAddress(auctionConfig.id),
                bestOfferToken: auctionInfo.bestOfferToken,
            },
            {
                offerPrice: maxOfferPriceAllowed,
                totalDeposit: auctionInfo.amountIn.add(auctionInfo.securityDeposit),
            },
            [payer],
            this.computeUnitsAndPriorityFee("improveOffer"),
            {
                skipPreflight: true,
            },
        );

        const processTime = Date.now() - localTimestamp + sendWaitBuffer;
        const wait = Number(endSlot - currentSlot) * 400 - processTime;

        if (wait > 0) {
            const self = this;

            setTimeout(async () => {
                const currentOfferCount = improvedOfferCounts.get(auctionKey)!;
                logger.debug(`Current offer count: ${currentOfferCount}`);

                if (currentOfferCount > offerCount) {
                    logger.warn("Skipping improved offer due to newer offer");
                } else if (self.canSendTransactions(1)) {
                    self.enqueueTransactions(1);
                    await utils.sendTransaction(
                        matchingEngine.program.provider.connection,
                        tx,
                        blockhashCache.latest,
                        logger,
                    );
                    self.pushRequestTime("Transaction");
                    self.enqueueTransactions(-1);
                } else {
                    logger.warn(`Improve offer throttled`);
                }
            }, wait);

            logger.info(`Waiting ${wait}ms to send improved offer`);
        }
    }

    private async _handleInitialOffer(
        payer: Keypair,
        fastVaa: VAA,
        order: FastMarketOrder,
    ): Promise<undefined> {
        const cfg = this.cfg;
        const connection = this.connection;
        const logger = this.logger;
        const matchingEngine = this.matchingEngine;
        const tokenBalances = this.tokenBalances;

        // The solver should already be initialized so this operation is safe.
        const blockhashCache = this.blockhashCache!;

        const { emitterChain, sequence } = fastVaa;
        const auction = matchingEngine.auctionAddress(keccak256(fastVaa.hash));

        const pricingParams = cfg.pricingParameters(toChainId(emitterChain));
        if (pricingParams === null) {
            logger.error(`No pricing parameters for ${emitterChain}`);
            return;
        }

        // See if the `maxFee` meets our minimum price threshold.
        const fairValue =
            (order.amountIn * BigInt(pricingParams.rollbackRisk * BASIS_POINT_PRECISION)) /
            BigInt(BASIS_POINT_PRECISION);
        const edge =
            fairValue +
            (fairValue * BigInt(pricingParams.offerEdge * BASIS_POINT_PRECISION)) /
                BigInt(BASIS_POINT_PRECISION);

        if (edge > order.maxFee) {
            logger.warn(
                `Auction for ${emitterChain}: fee too low, sequence: ${sequence}, max fee: ${order.maxFee}, edge: ${edge}`,
            );
            return;
        }

        const auctionConfig = this.auctionConfigs.getLatest();

        // See if we have enough funds to place the initial offer.
        const notionalDeposit = await matchingEngine.computeNotionalSecurityDeposit(
            order.amountIn,
            auctionConfig,
        );
        const totalDeposit = order.amountIn + order.maxFee + notionalDeposit;

        if (tokenBalances.get(payer.publicKey.toString())! < totalDeposit) {
            logger.error(
                `Payer ${payer.publicKey.toString()}: insufficient balance for initial offer`,
            );
            return;
        }

        logger.debug(`Prepare VAA verification for ${emitterChain}, sequence: ${sequence}`);
        const { postedVaa: fastVaaAccount, txs: verifySigsTxs } =
            await this._prepareVerificationTxs(payer, fastVaa);
        logger.debug(
            `Process ${verifySigsTxs.length} transactions to verify signatures and post VAA`,
        );

        // Attempt to post the VAA and place the initial offer in the same
        // transaction.
        const postVaaTx = verifySigsTxs.pop()!;

        logger.debug(
            `Prepare initialize auction, sequence=${
                fastVaa.sequence
            }, auction=${auction.toString()}`,
        );

        const initializeAuctionTx = await matchingEngine.placeInitialOfferTx(
            {
                payer: payer.publicKey,
                fastVaa: fastVaaAccount,
                auction,
                auctionConfig:
                    auctionConfig === undefined
                        ? undefined
                        : matchingEngine.auctionConfigAddress(auctionConfig?.id),
                fromRouterEndpoint: matchingEngine.routerEndpointAddress(toChainId(emitterChain)),
                toRouterEndpoint: matchingEngine.routerEndpointAddress(
                    toChainId(order.targetChain),
                ),
            },
            { offerPrice: order.maxFee, totalDeposit },
            [payer],
            this.computeUnitsAndPriorityFee("placeInitialOffer"),
            {
                // If the auction config is undefined, we spend time fetching when computing the
                // security deposit. It is not worth it to skip preflight in this case.
                skipPreflight: auctionConfig !== undefined,
                preflightCommitment: "processed",
            },
        );

        const postVaaSeparately = order.redeemerMessage.length > 145;
        if (!postVaaSeparately) {
            const {
                ixs: [postVaaIx],
                computeUnits: postVaaComputeUnits,
            } = postVaaTx;
            initializeAuctionTx.computeUnits += postVaaComputeUnits;
            initializeAuctionTx.ixs = [postVaaIx, ...initializeAuctionTx.ixs];
        }

        // Bail if the auction is already started.
        const isAuctionStarted = await connection
            .getAccountInfo(auction, { dataSlice: { offset: 0, length: 1 } })
            .then((info) => info !== null);

        if (isAuctionStarted) {
            logger.warn(`Auction for ${emitterChain}: already started, sequence: ${sequence}`);
            return;
        }

        // Send all verify signatures at once.
        await Promise.all(
            verifySigsTxs.map(async (tx) => {
                await utils.sendTransaction(connection, tx, blockhashCache.latest, logger);
                this.pushRequestTime("Transaction");
            }),
        );

        const self = this;

        (async function () {
            if (postVaaSeparately) {
                await utils.sendTransaction(connection, postVaaTx, blockhashCache.latest, logger);
                self.pushRequestTime("Transaction");
            }

            await utils.sendTransaction(
                connection,
                initializeAuctionTx,
                blockhashCache.latest,
                logger,
            );
            self.pushRequestTime("Transaction");
        })();
    }

    async _prepareVerificationTxs(
        payer: Keypair,
        vaa: VAA,
    ): Promise<{ postedVaa: PublicKey; txs: PreparedTransaction[] }> {
        const bumpCosts = this.bumpCosts;
        const connection = this.connection;
        const guardianSets = this.guardianSets;
        const matchingEngine = this.matchingEngine;

        const coreBridgeProgramId = matchingEngine.coreBridgeProgramId();

        const guardianSetIndex = vaa.guardianSet;

        // Have we cached the guardian set?
        if (!guardianSets.has(guardianSetIndex)) {
            const data = await coreUtils.getGuardianSet(
                connection,
                coreBridgeProgramId,
                guardianSetIndex,
            );

            const encodedGuardianSetIndex = Buffer.alloc(4);
            encodedGuardianSetIndex.writeUInt32BE(guardianSetIndex);

            const [, guardianSetBump] = PublicKey.findProgramAddressSync(
                [Buffer.from("GuardianSet"), encodedGuardianSetIndex],
                coreBridgeProgramId,
            );
            guardianSets.set(guardianSetIndex, data);
            bumpCosts.set("guardianSet", utils.bumpComputeUnits(guardianSetBump));

            const [, configBump] = PublicKey.findProgramAddressSync(
                [Buffer.from("Bridge"), encodedGuardianSetIndex],
                coreBridgeProgramId,
            );
            bumpCosts.set("config", utils.bumpComputeUnits(configBump));
        }

        const vaaSignatureSet = Keypair.generate();

        // Check if Fast VAA has already been posted.
        const verifySignaturesIxs = await utils.createVerifySignaturesInstructions(
            connection,
            matchingEngine.coreBridgeProgramId(),
            payer.publicKey,
            vaa,
            vaaSignatureSet.publicKey,
            undefined, // commitment
            guardianSets.get(guardianSetIndex),
        );
        verifySignaturesIxs.reverse();

        const txs: PreparedTransaction[] = [];

        let created = false;
        const guardianSetBumpCost = bumpCosts.get("guardianSet")!;
        let {
            computeUnits: verifySignaturesComputeUnits,
            feeMicroLamports: verifySignaturesFeeMicroLamports,
        } = this.computeUnitsAndPriorityFee("verifySignatures");
        verifySignaturesComputeUnits += guardianSetBumpCost;

        while (verifySignaturesIxs.length > 0) {
            const sigVerifyIx = verifySignaturesIxs.pop()!;
            // This is a spicy meatball. Two compute budget ixs precede the sig
            // verify ix.
            utils.unsafeFixSigVerifyIx(sigVerifyIx, 2);

            const verifySigsIx = verifySignaturesIxs.pop()!;

            txs.push({
                ixs: [sigVerifyIx, verifySigsIx],
                signers: [payer, vaaSignatureSet],
                computeUnits: verifySignaturesComputeUnits,
                feeMicroLamports: verifySignaturesFeeMicroLamports,
                txName: "verifySignatures",
                confirmOptions: { skipPreflight: true, commitment: "processed" },
            });
            created = true;
        }

        const postVaaIx = coreUtils.createPostVaaInstruction(
            connection,
            matchingEngine.coreBridgeProgramId(),
            payer.publicKey,
            vaa,
            vaaSignatureSet.publicKey,
        );

        const [postedVaa, postedVaaBump] = PublicKey.findProgramAddressSync(
            [Buffer.from("PostedVAA"), vaa.hash],
            matchingEngine.coreBridgeProgramId(),
        );

        let { computeUnits: postVaaComputeUnits, feeMicroLamports: postVaaFeeMicroLamports } =
            this.computeUnitsAndPriorityFee("postVaa");
        postVaaComputeUnits +=
            bumpCosts.get("config")! + guardianSetBumpCost + utils.bumpComputeUnits(postedVaaBump);

        txs.push({
            ixs: [postVaaIx],
            signers: [payer],
            computeUnits: postVaaComputeUnits,
            feeMicroLamports: postVaaFeeMicroLamports,
            txName: "postVaa",
            confirmOptions: {
                skipPreflight: true,
                commitment: "processed",
            },
        });

        return { postedVaa, txs };
    }

    private async _fetchCctpMessages(
        sourceDomain: number,
        txHash: string,
    ): Promise<{ message: Buffer; attestation: Buffer; eventNonce: bigint }[] | null> {
        const logger = this.logger;

        const request = `${CCTP_MESSAGES_ENDPOINT}/${sourceDomain}/${txHash}`;

        this.pushRequestTime("CCTP");
        const response = await _fetchJsonResponse(request, logger);
        if (response === null) {
            return null;
        }

        const { messages } = response;

        if (
            messages === undefined ||
            (messages.length !== undefined &&
                typeof messages.length == "number" &&
                messages.length == 0)
        ) {
            logger.error(`No CCTP messages found: ${request}`);
            return null;
        }

        // Validate response.
        for (let i = 0; i < messages.length; ++i) {
            const message = messages[i];
            if (
                message.message === undefined ||
                message.message == "" ||
                message.attestation === undefined ||
                message.attestation == "" ||
                message.attestation == "PENDING" ||
                message.eventNonce === undefined ||
                message.eventNonce == ""
            ) {
                logger.error(`Invalid message found in response: ${request}`);
                return null;
            }
        }

        return (messages as { message: string; attestation: string; eventNonce: string }[]).map(
            ({ message, attestation, eventNonce }) => {
                return {
                    message: Buffer.from(message.substring(2), "hex"),
                    attestation: Buffer.from(attestation.substring(2), "hex"),
                    eventNonce: BigInt(eventNonce),
                };
            },
        );
    }

    private async _fetchWormscanTxHash(vaaId: {
        emitterChain: Chain;
        emitterAddress: UniversalAddress;
        sequence: bigint;
    }): Promise<string | null> {
        const logger = this.logger;
        const { emitterChain: chain, emitterAddress: emitter, sequence } = vaaId;

        const request = `${WORMHOLESCAN_VAA_ENDPOINT_TESTNET}/${toChainId(
            chain,
        )}/${emitter.toString()}/${sequence.toString()}`;

        this.pushRequestTime("Wormscan");
        const response = await _fetchJsonResponse(request, logger);
        if (response === null) {
            return null;
        }

        const { data } = response;

        if (data === undefined || data.txHash === undefined || data.txHash == "") {
            logger.error(`No data found in response: ${request}`);
            return null;
        }

        if (chainToPlatform(chain) == "Evm") {
            return `0x${data.txHash}`;
        }

        logger.error(`Unsupported chain: ${chain}`);
        return null;
    }
}

async function _fetchJsonResponse(request: string, logger: Logger): Promise<any> {
    logger.info(`Fetching: ${request}`);

    const response = await fetch(request).catch((err) => {
        logger.error(err);
        return null;
    });

    if (response === null || response.status != 200) {
        logger.error(`Unsuccessful request: ${request}`);
        return null;
    }

    return response.json();
}
