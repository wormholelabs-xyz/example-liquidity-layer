import { BlockhashWithExpiryBlockHeight } from "@solana/web3.js";
import { Uint64, uint64ToBigInt } from "@wormhole-foundation/example-liquidity-layer-solana/common";
import {
    AuctionConfig,
    AuctionInfo,
    MatchingEngineProgram,
} from "@wormhole-foundation/example-liquidity-layer-solana/matchingEngine";
import { Logger } from "winston";
import { Payers } from "../../src/containers";
import { AppConfig, PricingParameters, sendTx } from "../../src/utils";

const SEND_WAIT_BUFFER_MS: number = 390;

export type ImproveOfferAuctionInput = {
    fastVaaHash: Buffer;
    info: AuctionInfo;
    config: AuctionConfig;
    currentSlot: bigint;
    endSlot: bigint;
    observationTimestamp: number;
};

export async function handleImproveOffer(
    payers: Payers,
    cfg: AppConfig,
    matchingEngine: MatchingEngineProgram,
    improvedOfferCounts: Map<string, number>, // Key == fastVaaHash.toString("base64")
    auctionInput: ImproveOfferAuctionInput,
    logger: Logger,
    latestBlockhash?: BlockhashWithExpiryBlockHeight,
) {
    const {
        fastVaaHash,
        info: auctionInfo,
        config: auctionConfig,
        currentSlot,
        endSlot,
        observationTimestamp,
    } = auctionInput;

    const auctionKey = fastVaaHash.toString("base64");
    let offerCount = (improvedOfferCounts.get(auctionKey) ?? 0) + 1;
    improvedOfferCounts.set(auctionKey, offerCount);

    const auction = matchingEngine.auctionAddress(fastVaaHash);

    // We cannot participate with an offer at this point.
    if (currentSlot >= endSlot) {
        logger.debug(`Skipping ended auction: ${auction.toString()}`);

        // Exit switch.
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

    if (!shouldImproveOffer(amountIn, maxOfferPriceAllowed, pricingParams)) {
        logger.debug(`Skipping too low offer: ${maxOfferPriceAllowed.toString()}`);
        return;
    }

    const payer = payers.useNext();
    if (payer === undefined) {
        logger.error("No payers available. Cannot handleImproveOffer");
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
        {
            feeMicroLamports: 10,
            computeUnits: 60_000,
        },
        {
            skipPreflight: true,
        },
    );

    const processTime = Date.now() - observationTimestamp + SEND_WAIT_BUFFER_MS;
    const wait = Number(endSlot - currentSlot) * 400 - processTime;

    if (wait > 0) {
        logger.info(`Waiting ${wait}ms to send improved offer`);

        setTimeout(() => {
            const currentOfferCount = improvedOfferCounts.get(auctionKey)!;
            logger.debug(`Current offer count: ${currentOfferCount}`);

            if (currentOfferCount > offerCount) {
                logger.warn("Skipping improved offer due to newer offer");
            } else {
                // Attempt to send without blocking.
                sendTx(matchingEngine.program.provider.connection, tx, logger, latestBlockhash);
            }
        }, wait);
    }
}

function shouldImproveOffer(
    amountIn: Uint64,
    maxOfferPriceAllowed: Uint64,
    pricingParameters: PricingParameters,
): boolean {
    const PRECISION = 10000n;

    const fairValue =
        (uint64ToBigInt(amountIn) * BigInt(pricingParameters.probability * Number(PRECISION))) /
        PRECISION;
    const fairValueWithEdge =
        fairValue +
        (fairValue * BigInt(pricingParameters.edgePctOfFv * Number(PRECISION))) / PRECISION;

    return fairValueWithEdge <= uint64ToBigInt(maxOfferPriceAllowed);
}
