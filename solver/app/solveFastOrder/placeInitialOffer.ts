import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { FastMarketOrder } from "@wormhole-foundation/example-liquidity-layer-definitions";
import { PreparedTransaction } from "@wormhole-foundation/example-liquidity-layer-solana";
import {
    AuctionConfig,
    MatchingEngineProgram,
} from "@wormhole-foundation/example-liquidity-layer-solana/matchingEngine";
import { ChainId, toChainId } from "@wormhole-foundation/sdk-base";
import { deserialize, keccak256, VAA } from "@wormhole-foundation/sdk-definitions";
import { utils as coreUtils } from "@wormhole-foundation/sdk-solana-core";
import { Logger } from "winston";
import * as utils from "../../src/utils";

interface PlaceInitialOfferAccounts {
    fastVaaAccount: PublicKey;
    auction: PublicKey;
    fromRouterEndpoint: PublicKey;
    toRouterEndpoint: PublicKey;
}

function getPlaceInitialOfferAccounts(
    matchingEngine: MatchingEngineProgram,
    fastVaa: VAA,
    toChain: ChainId,
): PlaceInitialOfferAccounts {
    const doubleHash = keccak256(fastVaa.hash);
    const fastVaaAccount = coreUtils.derivePostedVaaKey(
        matchingEngine.coreBridgeProgramId(),
        Buffer.from(fastVaa.hash),
    );
    const auction = matchingEngine.auctionAddress(doubleHash);
    const fromRouterEndpoint = matchingEngine.routerEndpointAddress(
        toChainId(fastVaa.emitterChain),
    );
    const toRouterEndpoint = matchingEngine.routerEndpointAddress(toChain);

    return {
        fastVaaAccount,
        auction,
        fromRouterEndpoint,
        toRouterEndpoint,
    };
}

function isFeeHighEnough(
    fastOrder: FastMarketOrder,
    pricingParameters: utils.PricingParameters,
): { shouldPlaceOffer: boolean; fvWithEdge: bigint } {
    const precision = 10000;
    const bnPrecision = BigInt(precision);

    const fairValue =
        (fastOrder.amountIn * BigInt(pricingParameters.probability * precision)) / bnPrecision;
    const fairValueWithEdge =
        fairValue + (fairValue * BigInt(pricingParameters.edgePctOfFv * precision)) / bnPrecision;

    if (fairValueWithEdge > fastOrder.maxFee) {
        return { shouldPlaceOffer: false, fvWithEdge: fairValueWithEdge };
    } else {
        return { shouldPlaceOffer: true, fvWithEdge: fairValueWithEdge };
    }
}

export async function handlePlaceInitialOffer(
    cfg: utils.AppConfig,
    matchingEngine: MatchingEngineProgram,
    fastVaa: VAA,
    order: FastMarketOrder,
    payer: Keypair,
    logicLogger: Logger,
    auctionConfig?: AuctionConfig,
): Promise<PreparedTransaction[] | undefined> {
    const connection = matchingEngine.program.provider.connection;

    const txs: PreparedTransaction[] = [];

    // Derive accounts necessary to place the intial offer. We can bypass deriving these
    // accounts by posting the VAA before generating the `placeIniitialOfferTx`, but we
    // don't here to reduce complexity.
    const { fastVaaAccount, auction, fromRouterEndpoint, toRouterEndpoint } =
        getPlaceInitialOfferAccounts(matchingEngine, fastVaa, toChainId(order.targetChain));

    // Bail if the auction is already started.
    const isAuctionStarted = await connection
        .getAccountInfo(auction, { dataSlice: { offset: 0, length: 1 } })
        .then((info) => info !== null);

    if (isAuctionStarted) {
        logicLogger.warn(`Auction already started, sequence=${fastVaa.sequence}`);
        return;
    }

    // See if the `maxFee` meets our minimum price threshold.
    const { shouldPlaceOffer, fvWithEdge } = isFeeHighEnough(
        order,
        cfg.pricingParameters(toChainId(fastVaa.emitterChain))!,
    );
    if (!shouldPlaceOffer) {
        logicLogger.warn(
            `Skipping sequence=${fastVaa.sequence} fee too low, maxFee=${order.maxFee}, fvWithEdge=${fvWithEdge}`,
        );
        return;
    }

    // See if we have enough funds to place the initial offer.
    const notionalDeposit = await matchingEngine.computeNotionalSecurityDeposit(
        order.amountIn,
        auctionConfig,
    );
    const totalDeposit = order.amountIn + order.maxFee + notionalDeposit;
    const isSufficient = utils.isBalanceSufficient(connection, payer.publicKey, totalDeposit);

    if (!isSufficient) {
        logicLogger.warn(
            `Insufficient balance to place initial offer, sequence=${fastVaa.sequence}`,
        );
        return;
    }

    logicLogger.debug(`Prepare verify signatures and post VAA, sequence=${fastVaa.sequence}`);
    const preparedPostVaaTxs = await utils.preparePostVaaTxs(
        connection,
        cfg,
        matchingEngine,
        payer,
        fastVaa,
        { skipPreflight: true, commitment: cfg.solanaCommitment() },
    );
    logicLogger.debug(
        `Process ${preparedPostVaaTxs.length} transactions to verify signatures and post VAA`,
    );

    // Attempt to post the VAA and place the initial offer in the same transaction.
    const {
        ixs: [postVaaIx],
        computeUnits: postVaaComputeUnits,
    } = preparedPostVaaTxs.pop()!;

    logicLogger.debug(
        `Prepare initialize auction, sequence=${fastVaa.sequence}, auction=${auction}`,
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
            fromRouterEndpoint,
            toRouterEndpoint,
        },
        { offerPrice: order.maxFee, totalDeposit },
        [payer],
        {
            computeUnits: postVaaComputeUnits + cfg.initiateAuctionComputeUnits(),
            feeMicroLamports: 10,
        },
        {
            // If the auction config is undefined, we spend time fetching when computing the
            // security deposit. It is not worth it to skip preflight in this case.
            skipPreflight: auctionConfig !== undefined,
        },
    );

    initializeAuctionTx.ixs = [postVaaIx, ...initializeAuctionTx.ixs];
    txs.push(...preparedPostVaaTxs, initializeAuctionTx);

    return txs;
}
